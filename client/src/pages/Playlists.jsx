import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  useUserPlaylists,
  useAdminPlaylists,
  usePlaylistMutations,
  usePlaylists,
} from "../hooks/usePlaylists";
import { usePlaylistMeta } from "../hooks/usePlaylistMeta";
import { usePlayerStore } from "../store/playerStore";
import { useAuthStore } from "../store/authStore";
import { getPlaylistSongs } from "../services/playlists.service";
import CreatePlaylistModal from "../components/playlists/CreatePlaylistModal";
import PlaylistCard from "../components/playlists/PlaylistCard";
import PlaylistFilterBar, {
  getSortComparator,
} from "../components/playlists/PlaylistFilterBar";
import ResumeBanner from "../components/playlists/ResumeBanner";

import TimelineView from "../components/playlists/TimelineView";
import {
  PlaylistGridSkeleton,
  PlaylistTimelineSkeletonGroup,
  ResumeBannerSkeleton,
} from "../components/playlists/PlaylistSkeleton";

// ── Inject responsive grid CSS once ───────────────────────────────────────────
let _gridStyleInjected = false;
const injectGridStyles = () => {
  if (_gridStyleInjected || typeof document === "undefined") return;
  _gridStyleInjected = true;
  const s = document.createElement("style");
  s.textContent = `
    /* Playlist grid — responsive columns */
    .pl-grid {
      display: grid;
      gap: 14px;
      grid-template-columns: repeat(2, 1fr);   /* mobile default: 2 col */
    }
    @media (min-width: 480px) {
      .pl-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (min-width: 640px) {
      .pl-grid { grid-template-columns: repeat(3, 1fr); }
    }
    @media (min-width: 768px) {
      .pl-grid { grid-template-columns: repeat(4, 1fr); }
    }
    @media (min-width: 1024px) {
      .pl-grid { grid-template-columns: repeat(5, 1fr); }
    }

    /* Responsive page padding */
    .pl-page {
      max-width: 1100px;
      margin: 0 auto;
      padding: 20px 16px 100px;
      font-family: 'Inter', sans-serif;
    }
    @media (min-width: 640px) {
      .pl-page { padding: 24px 20px 100px; }
    }
    @media (min-width: 1024px) {
      .pl-page { padding: 28px 24px 100px; }
    }
  `;
  document.head.appendChild(s);
};

// ── Debounce hook ─────────────────────────────────────────────────────────────
const useDebounce = (value, delay) => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
};

// ── Toast ─────────────────────────────────────────────────────────────────────
const useToast = () => {
  const [toasts, setToasts] = useState([]);
  const show = useCallback((message, type = "error") => {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4000,
    );
  }, []);
  return { toasts, show };
};

const ToastContainer = ({ toasts }) => (
  <div
    style={{
      position: "fixed",
      bottom: 90,
      right: 16,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      pointerEvents: "none",
      maxWidth: "calc(100vw - 32px)",
    }}
    aria-live="polite"
  >
    {toasts.map((t) => (
      <div
        key={t.id}
        role="alert"
        style={{
          background: t.type === "error" ? "#1f0a0a" : "#0a1f12",
          border: `1px solid ${t.type === "error" ? "#7f1d1d" : "#166534"}`,
          borderRadius: 10,
          padding: "10px 16px",
          color: t.type === "error" ? "#f87171" : "#22c55e",
          fontSize: 13,
          maxWidth: 300,
          boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        }}
      >
        {t.message}
      </div>
    ))}
  </div>
);

// ── Section header ────────────────────────────────────────────────────────────
const SectionHeader = ({ label, count }) => (
  <div
    style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}
  >
    <h2
      style={{
        color: "#6b7280",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.7px",
        fontWeight: 600,
        margin: 0,
      }}
    >
      {label}
    </h2>
    {count !== undefined && (
      <span
        style={{
          background: "#1f1f1f",
          color: "#4b5563",
          fontSize: 10,
          fontWeight: 600,
          padding: "2px 7px",
          borderRadius: 20,
          border: "1px solid #2a2a2a",
        }}
      >
        {count}
      </span>
    )}
  </div>
);

// ── Empty state ───────────────────────────────────────────────────────────────
const EmptyState = ({ message, ctaLabel, onCta, icon = "♪" }) => (
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 24px",
      textAlign: "center",
    }}
  >
    <div style={{ fontSize: 40, marginBottom: 14, opacity: 0.5 }}>{icon}</div>
    <p
      style={{
        fontSize: 14,
        marginBottom: ctaLabel ? 16 : 0,
        color: "#4b5563",
      }}
    >
      {message}
    </p>
    {ctaLabel && onCta && (
      <button
        onClick={onCta}
        style={{
          background: "#22c55e",
          color: "#000",
          border: "none",
          borderRadius: 8,
          padding: "8px 18px",
          fontSize: 13,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {ctaLabel}
      </button>
    )}
  </div>
);

// ── Grid section renderer ─────────────────────────────────────────────────────
// Uses `.pl-grid` CSS class for responsive columns.
// canDeleteFn(playlist) => boolean  — per-card delete permission
const GridSection = ({
  playlists,
  isUserOwned,
  canDeleteFn,
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
  <div className="pl-grid">
    {playlists.map((pl, i) => (
      <PlaylistCard
        key={pl.id}
        playlist={pl}
        isUserOwned={isUserOwned}
        canDelete={canDeleteFn ? canDeleteFn(pl) : false}
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
  injectGridStyles();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const { user, isAdmin } = useAuthStore();

  // ── Data hooks ────────────────────────────────────────────────────────────
  const { playlists: userPlaylists, loading: userLoading } = useUserPlaylists();
  const { adminPlaylists, loading: adminLoading } = useAdminPlaylists();
  const { deletePlaylist: deleteUserPlaylistMutation } = usePlaylistMutations();
  const { deletePlaylist: deleteAdminPlaylistMutation } = usePlaylists();
  // ── Meta hook ────────────────────────────────────────────────────────────
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

  // ── Playback ──────────────────────────────────────────────────────────────
  const setPlaybackContext = usePlayerStore((s) => s.setPlaybackContext);
  const playSong = usePlayerStore((s) => s.playSong);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showCreate, setShowCreate] = useState(false);
  const [rawSearch, setRawSearch] = useState("");
  const [sortKey, setSortKey] = useState("date_desc");
  const { toasts, show: showToast } = useToast();

  const searchTerm = useDebounce(rawSearch, 300);

  // ── Authorization ─────────────────────────────────────────────────────────
  // canDelete: admin can delete any playlist; user can delete only their own.
  // Backend enforces this too — this is for UI visibility only.
  const getCanDelete = useCallback(
    (playlist) => {
      if (isAdmin) return true;
      if (!user?.uid) return false;
      return playlist.ownerId === user.uid;
    },
    [isAdmin, user?.uid],
  );

  // Set of user-owned playlist IDs — for O(1) routing in handleDelete
  const userPlaylistIds = useMemo(
    () => new Set(userPlaylists.map((pl) => pl.id)),
    [userPlaylists],
  );

  // ── Filter + sort + pin-partition ─────────────────────────────────────────
  const processPlaylists = useCallback(
    (list) => {
      const q = searchTerm.trim().toLowerCase();
      const filtered = q
        ? list.filter((pl) => (pl.name ?? "").toLowerCase().includes(q))
        : list;
      const sorted = [...filtered].sort(getSortComparator(sortKey));
      const pinned = sorted.filter((pl) => pinnedIds.includes(pl.id));
      const unpinned = sorted.filter((pl) => !pinnedIds.includes(pl.id));
      return { pinned, unpinned, all: sorted, filteredCount: sorted.length };
    },
    [searchTerm, sortKey, pinnedIds],
  );

  const {
    pinned: pinnedPlaylists,
    unpinned: unpinnedUserPlaylists,
    all: allUserFiltered,
    filteredCount: userFilteredCount,
  } = useMemo(
    () => processPlaylists(userPlaylists),
    [processPlaylists, userPlaylists],
  );

  const { all: allAdminFiltered, filteredCount: adminFilteredCount } = useMemo(
    () => processPlaylists(adminPlaylists),
    [processPlaylists, adminPlaylists],
  );

  // ── Quick play ────────────────────────────────────────────────────────────
  const handleQuickPlay = useCallback(
    async (playlist, shuffle = false) => {
      try {
        const songs = await getPlaylistSongs(playlist.songIds ?? []);
        if (!songs.length) {
          showToast("This playlist has no songs yet.", "error");
          return;
        }
        const orderedSongs = shuffle
          ? [...songs].sort(() => Math.random() - 0.5)
          : songs;
        setPlaybackContext("playlist", playlist.id, orderedSongs, 0);
        playSong(orderedSongs[0]);
        writeLastPlayed({
          playlistId: playlist.id,
          playlistName: playlist.name,
          songId: orderedSongs[0]?.id ?? null,
          songTitle: orderedSongs[0]?.title ?? null,
          songArtist: orderedSongs[0]?.artist ?? null,
          songIndex: 0,
        });
      } catch (err) {
        console.error("[Playlists] handleQuickPlay error:", err.message);
        showToast("Failed to play playlist. Please try again.", "error");
      }
    },
    [setPlaybackContext, playSong, writeLastPlayed, showToast],
  );

  // ── Resume ────────────────────────────────────────────────────────────────
  const handleResume = useCallback(
    async (lp) => {
      try {
        const target = [...userPlaylists, ...adminPlaylists].find(
          (pl) => pl.id === lp.playlistId,
        );
        if (!target) {
          showToast("Playlist no longer exists.", "error");
          return;
        }
        const songs = await getPlaylistSongs(target.songIds ?? []);
        if (!songs.length) {
          showToast("This playlist has no songs.", "error");
          return;
        }
        const startIndex = Math.min(lp.songIndex ?? 0, songs.length - 1);
        setPlaybackContext("playlist", lp.playlistId, songs, startIndex);
        playSong(songs[startIndex]);
      } catch (err) {
        console.error("[Playlists] handleResume error:", err.message);
        showToast("Failed to resume. Please try again.", "error");
      }
    },
    [userPlaylists, adminPlaylists, setPlaybackContext, playSong, showToast],
  );

  // ── Delete ────────────────────────────────────────────────────────────────
  // Routes to correct mutation:
  //   User's playlist  → Firestore direct (fast)
  //   Library playlist → REST DELETE (admin only reaches this)
  const handleDelete = useCallback(
    (playlistId) => {
      if (!window.confirm("Delete this playlist? This cannot be undone."))
        return;
      try {
        if (userPlaylistIds.has(playlistId)) {
          deleteUserPlaylistMutation(playlistId);
        } else {
          deleteAdminPlaylistMutation(playlistId);
        }
      } catch (err) {
        console.error("[Playlists] delete error:", err.message);
        showToast("Failed to delete playlist. Please try again.", "error");
      }
    },
    [
      userPlaylistIds,
      deleteUserPlaylistMutation,
      deleteAdminPlaylistMutation,
      showToast,
    ],
  );

  // ── Toggle pin ────────────────────────────────────────────────────────────
  const handleTogglePin = useCallback(
    async (playlistId) => {
      try {
        await togglePin(playlistId);
      } catch (err) {
        showToast(err.message ?? "Failed to update pin.", "error");
      }
    },
    [togglePin, showToast],
  );

  // ── Rename ────────────────────────────────────────────────────────────────
  const handleRenameCommit = useCallback(
    async (playlistId, originalName) => {
      try {
        await commitRename(playlistId, originalName);
      } catch (err) {
        showToast(err.message ?? "Failed to rename.", "error");
      }
    },
    [commitRename, showToast],
  );

  // ── Shared section props ──────────────────────────────────────────────────
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

  const isLoading = userLoading || adminLoading;
  const totalCount = userPlaylists.length + adminPlaylists.length;
  const filteredCount = userFilteredCount + adminFilteredCount;

  return (
    <div className="pl-page">
      {/* Page header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
          flexWrap: "wrap",
          gap: 10,
        }}
      >
        <h1 style={{ color: "#fff", fontSize: 22, fontWeight: 700, margin: 0 }}>
          Playlists
        </h1>
        <button
          onClick={() => setShowCreate(true)}
          style={{
            background: "#22c55e",
            color: "#000",
            border: "none",
            borderRadius: 8,
            padding: "8px 16px",
            fontWeight: 700,
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "transform 0.15s ease",
            display: "flex",
            alignItems: "center",
            gap: 6,
            whiteSpace: "nowrap",
          }}
          onMouseEnter={(e) =>
            (e.currentTarget.style.transform = "scale(1.04)")
          }
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          + New Playlist
        </button>
      </div>

      {/* Meta error */}
      {metaError && (
        <div
          role="alert"
          style={{
            background: "#1f0a0a",
            border: "1px solid #7f1d1d",
            borderRadius: 8,
            padding: "10px 14px",
            color: "#f87171",
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

      {/* ── YOUR PLAYLISTS ── */}
      <div style={{ marginBottom: 36 }}>
        <SectionHeader label="Your Playlists" count={userFilteredCount} />

        {isLoading ? (
          viewMode === "grid" ? (
            <PlaylistGridSkeleton count={4} />
          ) : (
            <PlaylistTimelineSkeletonGroup count={3} />
          )
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
        ) : viewMode === "timeline" ? (
          <TimelineView
            playlists={allUserFiltered}
            isUserSection
            onDelete={handleDelete}
            canDeleteFn={getCanDelete}
            {...sharedProps}
          />
        ) : (
          <>
            {pinnedPlaylists.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  <span style={{ color: "#facc15", fontSize: 12 }}>★</span>
                  <span
                    style={{
                      color: "#4b5563",
                      fontSize: 11,
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Pinned
                  </span>
                </div>
                <GridSection
                  playlists={pinnedPlaylists}
                  isUserOwned
                  canDeleteFn={getCanDelete}
                  onDelete={handleDelete}
                  {...sharedProps}
                />
              </div>
            )}
            {unpinnedUserPlaylists.length > 0 && (
              <GridSection
                playlists={unpinnedUserPlaylists}
                isUserOwned
                canDeleteFn={getCanDelete}
                onDelete={handleDelete}
                {...sharedProps}
              />
            )}
          </>
        )}
      </div>

      {/* ── LIBRARY PLAYLISTS ── */}
      <div>
        <SectionHeader label="Library Playlists" count={adminFilteredCount} />

        {isLoading ? (
          viewMode === "grid" ? (
            <PlaylistGridSkeleton count={4} />
          ) : (
            <PlaylistTimelineSkeletonGroup count={3} />
          )
        ) : allAdminFiltered.length === 0 ? (
          <EmptyState
            message={
              searchTerm
                ? `No library playlists match "${searchTerm}"`
                : "No library playlists available."
            }
            icon="♪"
          />
        ) : viewMode === "timeline" ? (
          <TimelineView
            playlists={allAdminFiltered}
            isUserSection={false}
            onDelete={isAdmin ? handleDelete : undefined}
            canDeleteFn={getCanDelete}
            {...sharedProps}
          />
        ) : (
          <GridSection
            playlists={allAdminFiltered}
            isUserOwned={false}
            canDeleteFn={getCanDelete}
            onDelete={isAdmin ? handleDelete : undefined}
            {...sharedProps}
          />
        )}
      </div>

      {showCreate && (
        <CreatePlaylistModal onClose={() => setShowCreate(false)} />
      )}
      <ToastContainer toasts={toasts} />
    </div>
  );
};

export default Playlists;
