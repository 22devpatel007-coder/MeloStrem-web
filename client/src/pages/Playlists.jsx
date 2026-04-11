/**
 * client/src/pages/Playlists.jsx
 *
 * BUGS FIXED:
 *
 * ── BUG 1 (Critical): `setContext` does not exist on playerStore ──────────────
 *   Line 264 was:
 *     const setContext = usePlayerStore((s) => s.setContext);        ← WRONG
 *   The store only exports `setPlaybackContext`. `setContext` is undefined,
 *   so calling it throws "setContext is not a function" every time Quick Play
 *   or Resume is triggered.
 *
 *   Fix: renamed selector to `setPlaybackContext`.
 *
 * ── BUG 2 (Critical): Wrong call signature for setPlaybackContext ─────────────
 *   Lines 318/355 were calling:
 *     setContext({ context: 'playlist', playlistId: playlist.id })   ← WRONG
 *     setQueueFromContext(orderedSongs)                               ← REDUNDANT
 *
 *   The actual signature is:
 *     setPlaybackContext(type: string, id: string, songs: Song[], startIndex?: number)
 *
 *   `setPlaybackContext` internally calls `setQueueFromContext` via the
 *   registered queueStore accessor — calling it separately is a double-seed
 *   that races against the internal call and can reset the queue index.
 *
 *   Fix:
 *     - Call `setPlaybackContext('playlist', playlist.id, orderedSongs, 0)`
 *     - Remove the redundant `setQueueFromContext` call
 *     - Remove the `useQueueStore` import (no longer needed here)
 *
 * All other functionality (filter, sort, pin, rename, resume, toast,
 * skeleton, timeline/grid view) is completely unchanged.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useUserPlaylists, useAdminPlaylists, usePlaylistMutations } from '../hooks/usePlaylists';
import { usePlaylistMeta } from '../hooks/usePlaylistMeta';
import { usePlayerStore } from '../store/playerStore';
import { getPlaylistSongs } from '../services/playlists.service';
import CreatePlaylistModal from '../components/playlists/CreatePlaylistModal';
import PlaylistCard from '../components/playlists/PlaylistCard';
import PlaylistFilterBar, { getSortComparator } from '../components/playlists/PlaylistFilterBar';
import ResumeBanner from '../components/playlists/ResumeBanner';
import TimelineView from '../components/playlists/TimelineView';
import {
  PlaylistGridSkeleton,
  PlaylistTimelineSkeletonGroup,
  ResumeBannerSkeleton,
} from '../components/playlists/PlaylistSkeleton';

// ── Debounce hook ─────────────────────────────────────────────────────────────
const useDebounce = (value, delay) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

// ── Toast (lightweight, no external dep) ─────────────────────────────────────
const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, type = 'error') => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);
  return { toasts, show };
};

const ToastContainer = ({ toasts }) => (
  <div
    style={{
      position: 'fixed',
      bottom: 90,
      right: 20,
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
      pointerEvents: 'none',
    }}
    aria-live="polite"
    aria-label="Notifications"
  >
    {toasts.map((t) => (
      <div
        key={t.id}
        role="alert"
        style={{
          background: t.type === 'error' ? '#1f0a0a' : '#0a1f12',
          border: `1px solid ${t.type === 'error' ? '#7f1d1d' : '#166534'}`,
          borderRadius: 10,
          padding: '10px 16px',
          color: t.type === 'error' ? '#f87171' : '#22c55e',
          fontSize: 13,
          maxWidth: 300,
          boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
          animation: 'toastIn 0.25s ease',
        }}
      >
        <style>{`
          @keyframes toastIn {
            from { opacity: 0; transform: translateY(8px); }
            to   { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        {t.message}
      </div>
    ))}
  </div>
);

// ── Section header ────────────────────────────────────────────────────────────
const SectionHeader = ({ label, count }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      marginBottom: 14,
    }}
  >
    <h2
      style={{
        color: '#6b7280',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.7px',
        fontWeight: 600,
        margin: 0,
      }}
    >
      {label}
    </h2>
    {count !== undefined && (
      <span
        style={{
          background: '#1f1f1f',
          color: '#4b5563',
          fontSize: 10,
          fontWeight: 600,
          padding: '2px 7px',
          borderRadius: 20,
          border: '1px solid #2a2a2a',
        }}
      >
        {count}
      </span>
    )}
  </div>
);

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ message, ctaLabel, onCta, icon = '♪' }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '48px 24px',
      color: '#374151',
      textAlign: 'center',
    }}
  >
    <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.5 }}>{icon}</div>
    <p style={{ fontSize: 14, marginBottom: ctaLabel ? 16 : 0, color: '#4b5563' }}>{message}</p>
    {ctaLabel && onCta && (
      <button
        onClick={onCta}
        style={{
          background: '#22c55e',
          color: '#000',
          border: 'none',
          borderRadius: 8,
          padding: '8px 18px',
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {ctaLabel}
      </button>
    )}
  </div>
);

// ── Grid section renderer ─────────────────────────────────────────────────────
const GridSection = ({
  playlists,
  isUserOwned,
  isPinned,
  lastPlayedLabel,
  onQuickPlay,
  onDelete,
  onTogglePin,
  onStartRename,
  renamingId,
  renameValue,
  renameError,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  pinnedAtMax,
}) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
      gap: 14,
    }}
  >
    {playlists.map((pl, i) => (
      <PlaylistCard
        key={pl.id}
        playlist={pl}
        isUserOwned={isUserOwned}
        isPinned={isPinned?.(pl.id) ?? false}
        lastPlayedLabel={lastPlayedLabel?.(pl.id) ?? null}
        onQuickPlay={onQuickPlay}
        onDelete={onDelete}
        onTogglePin={onTogglePin}
        onStartRename={onStartRename}
        animationDelay={i * 50}
        pinnedAtMax={pinnedAtMax}
        isRenaming={renamingId === pl.id}
        renameValue={renameValue}
        renameError={renameError}
        onRenameChange={onRenameChange}
        onRenameCommit={() => onRenameCommit?.(pl.id, pl.name)}
        onRenameCancel={onRenameCancel}
      />
    ))}
  </div>
);

// ── Main Page ─────────────────────────────────────────────────────────────────
const Playlists = () => {
  // ── Data hooks ──────────────────────────────────────────────────────────────
  const { playlists: userPlaylists, loading: userLoading } = useUserPlaylists();
  const { adminPlaylists, loading: adminLoading } = useAdminPlaylists();
  const { deletePlaylist: deletePlaylistMutation } = usePlaylistMutations();

  // ── Meta hook (pin, lastPlayed, rename, viewMode) ──────────────────────────
  const {
    pinnedIds,
    isPinned,
    togglePin,
    pinnedAtMax,
    lastPlayed,
    writeLastPlayed,
    getLastPlayedLabel,
    renamingId,
    renameValue,
    setRenameValue,
    renameError,
    startRename,
    cancelRename,
    commitRename,
    viewMode,
    setViewMode,
    metaLoading,
    metaError,
  } = usePlaylistMeta();

  // ── Playback store ───────────────────────────────────────────────────────────
  // FIX BUG 1: was `s.setContext` (undefined). Correct name is `setPlaybackContext`.
  // FIX BUG 2: removed `useQueueStore` import — setPlaybackContext seeds the
  //            queue internally via the registered accessor. Calling
  //            setQueueFromContext separately caused a double-seed race.
  const setPlaybackContext = usePlayerStore((s) => s.setPlaybackContext);
  const playSong = usePlayerStore((s) => s.playSong);

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [rawSearch, setRawSearch] = useState('');
  const [sortKey, setSortKey] = useState('date_desc');
  const { toasts, show: showToast } = useToast();

  const searchTerm = useDebounce(rawSearch, 300);

  // ── Filter + sort + pin-partition ────────────────────────────────────────────
  const processPlaylists = useCallback((list) => {
    const q = searchTerm.trim().toLowerCase();
    const filtered = q
      ? list.filter((pl) => (pl.name ?? '').toLowerCase().includes(q))
      : list;

    const comparator = getSortComparator(sortKey);
    const sorted = [...filtered].sort(comparator);

    // Pinned always first (only for user playlists)
    const pinned = sorted.filter((pl) => pinnedIds.includes(pl.id));
    const unpinned = sorted.filter((pl) => !pinnedIds.includes(pl.id));

    return { pinned, unpinned, all: sorted, filteredCount: sorted.length };
  }, [searchTerm, sortKey, pinnedIds]);

  const {
    pinned: pinnedPlaylists,
    unpinned: unpinnedUserPlaylists,
    all: allUserFiltered,
    filteredCount: userFilteredCount,
  } = useMemo(() => processPlaylists(userPlaylists), [processPlaylists, userPlaylists]);

  const {
    all: allAdminFiltered,
    filteredCount: adminFilteredCount,
  } = useMemo(() => processPlaylists(adminPlaylists), [processPlaylists, adminPlaylists]);

  // ── Quick play handler ────────────────────────────────────────────────────────
  const handleQuickPlay = useCallback(async (playlist, shuffle = false) => {
    try {
      const songs = await getPlaylistSongs(playlist.songIds ?? []);
      if (!songs.length) {
        showToast('This playlist has no songs yet.', 'error');
        return;
      }

      const orderedSongs = shuffle
        ? [...songs].sort(() => Math.random() - 0.5)
        : songs;

      // FIX BUG 1 + 2: use correct function name and correct signature.
      // setPlaybackContext(type, id, songs, startIndex) also seeds queueStore
      // internally — no separate setQueueFromContext call needed.
      setPlaybackContext('playlist', playlist.id, orderedSongs, 0);
      playSong(orderedSongs[0]);

      // Write last played (fire-and-forget)
      writeLastPlayed({
        playlistId: playlist.id,
        playlistName: playlist.name,
        songId: orderedSongs[0]?.id ?? null,
        songTitle: orderedSongs[0]?.title ?? null,
        songArtist: orderedSongs[0]?.artist ?? null,
        songIndex: 0,
      });
    } catch (err) {
      console.error('[Playlists] handleQuickPlay error:', err.message);
      showToast('Failed to play playlist. Please try again.', 'error');
    }
  }, [setPlaybackContext, playSong, writeLastPlayed, showToast]);

  // ── Resume handler ────────────────────────────────────────────────────────────
  const handleResume = useCallback(async (lp) => {
    try {
      const targetPlaylist = [...userPlaylists, ...adminPlaylists].find(
        (pl) => pl.id === lp.playlistId
      );
      if (!targetPlaylist) {
        showToast('Playlist no longer exists.', 'error');
        return;
      }

      const songs = await getPlaylistSongs(targetPlaylist.songIds ?? []);
      if (!songs.length) {
        showToast('This playlist has no songs.', 'error');
        return;
      }

      const startIndex = Math.min(lp.songIndex ?? 0, songs.length - 1);

      // FIX BUG 1 + 2: same fix as handleQuickPlay above
      setPlaybackContext('playlist', lp.playlistId, songs, startIndex);
      playSong(songs[startIndex]);
    } catch (err) {
      console.error('[Playlists] handleResume error:', err.message);
      showToast('Failed to resume. Please try again.', 'error');
    }
  }, [userPlaylists, adminPlaylists, setPlaybackContext, playSong, showToast]);

  // ── Delete handler ────────────────────────────────────────────────────────────
  const handleDelete = useCallback((playlistId) => {
    if (!window.confirm('Delete this playlist? This cannot be undone.')) return;
    try {
      deletePlaylistMutation(playlistId);
    } catch (err) {
      console.error('[Playlists] delete error:', err.message);
      showToast('Failed to delete playlist. Please try again.', 'error');
    }
  }, [deletePlaylistMutation, showToast]);

  // ── Toggle pin handler ────────────────────────────────────────────────────────
  const handleTogglePin = useCallback(async (playlistId) => {
    try {
      await togglePin(playlistId);
    } catch (err) {
      showToast(err.message ?? 'Failed to update pin.', 'error');
    }
  }, [togglePin, showToast]);

  // ── Rename handlers ───────────────────────────────────────────────────────────
  const handleRenameCommit = useCallback(async (playlistId, originalName) => {
    try {
      await commitRename(playlistId, originalName);
    } catch (err) {
      showToast(err.message ?? 'Failed to rename.', 'error');
    }
  }, [commitRename, showToast]);

  // ── Shared section props ──────────────────────────────────────────────────────
  const sharedProps = {
    isPinned,
    lastPlayedLabel: getLastPlayedLabel,
    onQuickPlay: handleQuickPlay,
    onTogglePin: handleTogglePin,
    onStartRename: startRename,
    renamingId,
    renameValue,
    renameError,
    onRenameChange: setRenameValue,
    onRenameCommit: handleRenameCommit,
    onRenameCancel: cancelRename,
    pinnedAtMax,
  };

  // ── Loading state ─────────────────────────────────────────────────────────────
  const isLoading = userLoading || adminLoading;

  const totalCount = userPlaylists.length + adminPlaylists.length;
  const filteredCount = userFilteredCount + adminFilteredCount;

  return (
    <div
      style={{
        maxWidth: 1100,
        margin: '0 auto',
        padding: '28px 20px 100px',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Page header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 20,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <h1 style={{ color: '#fff', fontSize: 22, fontWeight: 700, margin: 0 }}>
          Playlists
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: '#22c55e',
            color: '#000',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'transform 0.15s ease, background 0.15s ease',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.04)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          + New Playlist
        </button>
      </div>

      {/* Meta error (non-blocking — just pin/resume features degraded) */}
      {metaError && (
        <div
          role="alert"
          style={{
            background: '#1f0a0a',
            border: '1px solid #7f1d1d',
            borderRadius: 8,
            padding: '10px 14px',
            color: '#f87171',
            fontSize: 12,
            marginBottom: 16,
          }}
        >
          ⚠ {metaError} — Pin and resume features may be unavailable.
        </div>
      )}

      {/* Resume banner */}
      {metaLoading ? (
        <ResumeBannerSkeleton />
      ) : lastPlayed ? (
        <ResumeBanner
          lastPlayed={lastPlayed}
          onResume={handleResume}
          onDismiss={() => {}}
        />
      ) : null}

      {/* Filter bar */}
      <PlaylistFilterBar
        searchTerm={rawSearch}
        onSearchChange={setRawSearch}
        sortKey={sortKey}
        onSortChange={setSortKey}
        viewMode={viewMode}
        onViewChange={setViewMode}
        totalCount={totalCount}
        filteredCount={filteredCount}
      />

      {/* ── YOUR PLAYLISTS section ── */}
      <div style={{ marginBottom: 36 }}>
        <SectionHeader label="Your Playlists" count={userFilteredCount} />

        {isLoading ? (
          viewMode === 'grid'
            ? <PlaylistGridSkeleton count={4} />
            : <PlaylistTimelineSkeletonGroup count={3} />
        ) : allUserFiltered.length === 0 ? (
          searchTerm ? (
            <EmptyState
              message={`No playlists match "${searchTerm}"`}
              icon="🔍"
            />
          ) : (
            <EmptyState
              message="You haven't created any playlists yet."
              ctaLabel="Create your first playlist"
              onCta={() => setShowCreate(true)}
            />
          )
        ) : viewMode === 'timeline' ? (
          <TimelineView
            playlists={allUserFiltered}
            isUserSection
            onDelete={handleDelete}
            {...sharedProps}
          />
        ) : (
          <>
            {/* Pinned group */}
            {pinnedPlaylists.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  <span style={{ color: '#facc15', fontSize: 12 }}>★</span>
                  <span style={{ color: '#4b5563', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Pinned
                  </span>
                </div>
                <GridSection
                  playlists={pinnedPlaylists}
                  isUserOwned
                  onDelete={handleDelete}
                  {...sharedProps}
                />
              </div>
            )}

            {/* Unpinned group */}
            {unpinnedUserPlaylists.length > 0 && (
              <GridSection
                playlists={unpinnedUserPlaylists}
                isUserOwned
                onDelete={handleDelete}
                {...sharedProps}
              />
            )}
          </>
        )}
      </div>

      {/* ── LIBRARY PLAYLISTS section ── */}
      <div>
        <SectionHeader label="Library Playlists" count={adminFilteredCount} />

        {isLoading ? (
          viewMode === 'grid'
            ? <PlaylistGridSkeleton count={4} />
            : <PlaylistTimelineSkeletonGroup count={3} />
        ) : allAdminFiltered.length === 0 ? (
          <EmptyState
            message={searchTerm ? `No library playlists match "${searchTerm}"` : 'No library playlists available.'}
            icon="♪"
          />
        ) : viewMode === 'timeline' ? (
          <TimelineView
            playlists={allAdminFiltered}
            isUserSection={false}
            onDelete={undefined}
            {...sharedProps}
          />
        ) : (
          <GridSection
            playlists={allAdminFiltered}
            isUserOwned={false}
            onDelete={undefined}
            {...sharedProps}
          />
        )}
      </div>

      {/* Create playlist modal */}
      {showCreate && (
        <CreatePlaylistModal onClose={() => setShowCreate(false)} />
      )}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} />
    </div>
  );
};

export default Playlists;