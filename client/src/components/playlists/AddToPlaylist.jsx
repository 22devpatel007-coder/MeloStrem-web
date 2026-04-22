/**
 * client/src/components/playlists/AddToPlaylist.jsx
 *
 * PERMANENT FIX — ReactDOM.createPortal
 *
 * ROOT CAUSE:
 *   Same as OptionsSheet — position:fixed was contained by overflow:hidden
 *   ancestors in App.jsx, not the viewport.
 *
 * FIX:
 *   Wrap render output in ReactDOM.createPortal(content, document.body).
 *   All hooks, state, and handlers work exactly as before.
 *
 * RESPONSIVE BEHAVIOR (unchanged):
 *   Mobile  (<640px)   — full-screen overlay, slides up from bottom
 *   Tablet  (640–1023) — centered modal, 480px wide, vertically centered
 *   Desktop (≥1024px)  — RIGHT SIDE DRAWER, 360px wide, full viewport height
 *
 * Props: { song, onClose } — unchanged.
 */

import { useState, useEffect, useCallback, useRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { useUserPlaylists, usePlaylistMutations } from '../../hooks/usePlaylists';
import { useToast } from '../ui/Toast';
import CreatePlaylistModal from './CreatePlaylistModal';

// ── Component ─────────────────────────────────────────────────────────────────
const AddToPlaylist = memo(({ song, onClose }) => {
  const { playlists, loading: playlistsLoading } = useUserPlaylists();
  const { addSongToPlaylist } = usePlaylistMutations();
  const { toast } = useToast();

  const [added,   setAdded]   = useState({});
  const [errors,  setErrors]  = useState({});
  const [loading, setLoading] = useState({});

  const [visible,   setVisible]   = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  const [showCreate, setShowCreate] = useState(false);

  const autoCloseRef = useRef(null);

  // ── Animation lifecycle ─────────────────────────────────────────────────
  useEffect(() => {
    setVisible(true);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setAnimateIn(true)),
    );
    return () => clearTimeout(autoCloseRef.current);
  }, []);

  // ── Keyboard: Escape closes ─────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showCreate) setShowCreate(false);
        else handleClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [showCreate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Close with animation ────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    setAnimateIn(false);
    setTimeout(() => {
      setVisible(false);
      onClose();
    }, 280);
  }, [onClose]);

  // ── Add song to playlist ────────────────────────────────────────────────
  const handleAdd = useCallback(
    async (playlistId, playlistName) => {
      if (loading[playlistId]) return;

      setErrors((prev)  => ({ ...prev, [playlistId]: null }));
      setLoading((prev) => ({ ...prev, [playlistId]: true }));

      try {
        await addSongToPlaylist(playlistId, song.id);
        setAdded((prev) => ({ ...prev, [playlistId]: true }));
        toast.success(`Added to "${playlistName}" ♪`);
        autoCloseRef.current = setTimeout(handleClose, 600);
      } catch (err) {
        console.error('[AddToPlaylist] addSongToPlaylist failed:', err.message);
        const msg = err.message.includes('no longer exists')
          ? 'Playlist deleted — refresh.'
          : 'Failed to add. Tap to retry.';
        setErrors((prev) => ({ ...prev, [playlistId]: msg }));
        toast.error(msg);
      } finally {
        setLoading((prev) => ({ ...prev, [playlistId]: false }));
      }
    },
    [loading, addSongToPlaylist, song.id, toast, handleClose],
  );

  if (!visible) return null;

  // ── PORTAL: render into document.body, completely outside app DOM tree ────
  return createPortal(
    <>
      <style>{SHEET_STYLES}</style>

      {/*
        CreatePlaylistModal renders at z-index 500, above this panel (z-index 10000).
        It also uses createPortal internally if it has a fixed backdrop.
      */}
      {showCreate && (
        <CreatePlaylistModal
          onClose={() => setShowCreate(false)}
          navigateOnCreate={false}
        />
      )}

      {/* ── Backdrop ── */}
      <div
        className="atp-backdrop"
        style={{ '--atp-opacity': animateIn ? '1' : '0' }}
        onClick={handleClose}
        aria-label="Close Add to Playlist"
      >
        {/* ── Panel ── */}
        <div
          className={[
            'atp-panel',
            animateIn ? 'atp-panel--in' : 'atp-panel--out',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Add to playlist"
        >
          {/* ── Header with back button ── */}
          <div className="atp-header">
            <button
              className="atp-back-btn"
              onClick={handleClose}
              aria-label="Go back"
            >
              <BackIcon />
            </button>
            <h2 className="atp-title">Add to Playlist</h2>
            <div className="atp-header-spacer" aria-hidden="true" />
          </div>

          {/* ── Song identity strip ── */}
          <div className="atp-song-header">
            <div className="atp-song-cover-wrap">
              <img
                src={song.coverUrl || 'https://placehold.co/48x48/111/444?text=♪'}
                alt={song.title}
                className="atp-song-cover"
                onError={(e) => {
                  e.target.src = 'https://placehold.co/48x48/111/444?text=♪';
                }}
              />
            </div>
            <div className="atp-song-info">
              <p className="atp-song-title">{song.title}</p>
              <p className="atp-song-artist">{song.artist}</p>
            </div>
            <MusicNoteIcon />
          </div>

          <div className="atp-divider" />

          {/* ── + New Playlist ── */}
          <button
            className="atp-new-playlist-row"
            onClick={() => setShowCreate(true)}
          >
            <span className="atp-new-playlist-icon">
              <PlusIcon />
            </span>
            <span className="atp-new-playlist-label">New Playlist</span>
          </button>

          <div className="atp-divider atp-divider--light" />

          {/* ── Scrollable playlist list ── */}
          <div className="atp-list" role="list">
            {playlistsLoading && (
              <div className="atp-loading-state">
                <LoadingSpinner size={20} />
                <span>Loading playlists…</span>
              </div>
            )}

            {!playlistsLoading && playlists.length === 0 && (
              <div className="atp-empty-state">
                <p className="atp-empty-title">No playlists yet</p>
                <p className="atp-empty-sub">Create your first playlist above</p>
              </div>
            )}

            {!playlistsLoading &&
              playlists.map((pl) => {
                const alreadyIn  = pl.songIds?.includes(song.id);
                const justAdded  = !!added[pl.id];
                const isLoading  = !!loading[pl.id];
                const rowError   = errors[pl.id] || null;
                const isAdded    = alreadyIn || justAdded;
                const isDisabled = isAdded || isLoading;

                let rowState = 'default';
                if (isLoading)     rowState = 'loading';
                else if (isAdded)  rowState = 'added';
                else if (rowError) rowState = 'error';

                return (
                  <PlaylistRow
                    key={pl.id}
                    playlist={pl}
                    rowState={rowState}
                    errorMsg={rowError}
                    disabled={isDisabled}
                    onTap={() => handleAdd(pl.id, pl.name)}
                  />
                );
              })}
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
});

AddToPlaylist.displayName = 'AddToPlaylist';

// ── PlaylistRow ───────────────────────────────────────────────────────────────
const PlaylistRow = memo(({ playlist, rowState, errorMsg, disabled, onTap }) => {
  const songCount = playlist.songIds?.length ?? 0;

  const stateClass = {
    default: '',
    loading: 'atp-row--loading',
    added:   'atp-row--added',
    error:   'atp-row--error',
  }[rowState] || '';

  return (
    // AFTER — remove role="listitem" only
<button
  className={['atp-row', stateClass].join(' ')}
  onClick={disabled ? undefined : onTap}
  disabled={disabled}
  aria-label={`Add to ${playlist.name}`}
  aria-pressed={rowState === 'added'}
>
      <div className="atp-row__dot-wrap">
        {playlist.coverUrl ? (
          <img
            src={playlist.coverUrl}
            alt={playlist.name}
            className="atp-row__dot-img"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        ) : (
          <div
            className="atp-row__dot"
            style={{ background: stringToColor(playlist.name) }}
          />
        )}
      </div>

      <div className="atp-row__info">
        <p className="atp-row__name">{playlist.name}</p>
        <p className="atp-row__meta">
          {rowState === 'error'
            ? errorMsg
            : `${songCount} song${songCount !== 1 ? 's' : ''}`}
        </p>
      </div>

      <span className="atp-row__indicator" aria-hidden="true">
        {rowState === 'loading' && <LoadingSpinner size={16} />}
        {rowState === 'added'   && <CheckIcon />}
        {rowState === 'error'   && <RetryIcon />}
        {rowState === 'default' && <ChevronIcon />}
      </span>
    </button>
  );
});

PlaylistRow.displayName = 'PlaylistRow';

// ── Color utility ─────────────────────────────────────────────────────────────
function stringToColor(str = '') {
  const PALETTE = [
    '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
    '#10b981', '#3b82f6', '#ef4444', '#14b8a6',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const BackIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const PlusIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const CheckIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
    stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ChevronIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const RetryIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
    stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="1 4 1 10 7 10" />
    <path d="M3.51 15a9 9 0 1 0 .49-3.45" />
  </svg>
);

const MusicNoteIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="#4b5563" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, marginLeft: 'auto' }}>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

const LoadingSpinner = ({ size = 18 }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5"
    strokeLinecap="round"
    style={{ animation: 'atp-spin 0.75s linear infinite', flexShrink: 0 }}
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

// ── Styles ────────────────────────────────────────────────────────────────────
const SHEET_STYLES = `
  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     MOBILE BASE  (<640px) — full-screen overlay, slides up from bottom
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

  .atp-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: rgba(0, 0, 0, 0.65);
    opacity: var(--atp-opacity, 0);
    transition: opacity 0.28s ease;
  }

  .atp-panel {
    position: relative;
    width: 100%;
    height: 100dvh;
    height: 100vh;
    background: #141414;
    border-radius: 0;
    padding: 0;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1),
                opacity   0.28s ease;
  }
  .atp-panel--out { transform: translateY(100%); opacity: 0; }
  .atp-panel--in  { transform: translateY(0);    opacity: 1; }

  /* ── Header ── */
  .atp-header {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 12px 8px 12px 4px;
    padding-top: max(12px, env(safe-area-inset-top, 12px));
    flex-shrink: 0;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .atp-back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px; height: 40px;
    border-radius: 50%;
    background: none; border: none;
    color: #e5e7eb;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    flex-shrink: 0; padding: 0;
  }
  .atp-back-btn:hover  { background: rgba(255,255,255,0.08); color: #fff; }
  .atp-back-btn:active { background: rgba(255,255,255,0.14); }
  .atp-header-spacer { width: 40px; flex-shrink: 0; }
  .atp-title {
    flex: 1; text-align: center;
    color: #f3f4f6; font-size: 16px; font-weight: 700; margin: 0;
    letter-spacing: -0.01em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Song identity strip ── */
  .atp-song-header {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 20px; flex-shrink: 0;
  }
  .atp-song-cover-wrap {
    width: 44px; height: 44px;
    border-radius: 8px; overflow: hidden;
    background: #1f1f1f; flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .atp-song-cover { width: 100%; height: 100%; object-fit: cover; display: block; }
  .atp-song-info  { flex: 1; min-width: 0; }
  .atp-song-title {
    color: #f3f4f6; font-size: 13px; font-weight: 600; margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .atp-song-artist {
    color: #6b7280; font-size: 12px; margin: 3px 0 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* ── Dividers ── */
  .atp-divider       { height: 1px; background: rgba(255,255,255,0.07); flex-shrink: 0; }
  .atp-divider--light { background: rgba(255,255,255,0.04); }

  /* ── New Playlist row ── */
  .atp-new-playlist-row {
    display: flex; align-items: center; gap: 14px;
    width: 100%; padding: 14px 20px;
    background: none; border: none; cursor: pointer;
    font-family: inherit; transition: background 0.12s; flex-shrink: 0;
  }
  .atp-new-playlist-row:hover { background: rgba(255,255,255,0.04); }
  .atp-new-playlist-icon {
    width: 40px; height: 40px; border-radius: 10px;
    background: rgba(34,197,94,0.1);
    border: 1.5px dashed rgba(34,197,94,0.35);
    display: flex; align-items: center; justify-content: center;
    color: #22c55e; flex-shrink: 0;
    transition: background 0.15s, border-color 0.15s;
  }
  .atp-new-playlist-row:hover .atp-new-playlist-icon {
    background: rgba(34,197,94,0.15);
    border-color: rgba(34,197,94,0.55);
  }
  .atp-new-playlist-label {
    color: #22c55e; font-size: 14px; font-weight: 600; letter-spacing: -0.01em;
  }

  /* ── Scrollable list ── */
  .atp-list {
    overflow-y: auto; flex: 1; min-height: 0;
    scrollbar-width: thin; scrollbar-color: #2d2d2d transparent;
  }
  .atp-list::-webkit-scrollbar { width: 4px; }
  .atp-list::-webkit-scrollbar-track { background: transparent; }
  .atp-list::-webkit-scrollbar-thumb { background: #2d2d2d; border-radius: 2px; }

  /* ── States ── */
  .atp-loading-state {
    display: flex; align-items: center; gap: 10px;
    padding: 24px 20px; color: #6b7280; font-size: 13px;
  }
  .atp-empty-state { padding: 32px 20px; text-align: center; }
  .atp-empty-title { color: #9ca3af; font-size: 14px; font-weight: 500; margin: 0 0 4px; }
  .atp-empty-sub   { color: #4b5563; font-size: 12px; margin: 0; }

  /* ── Playlist rows ── */
  .atp-row {
    display: flex; align-items: center; gap: 14px;
    width: 100%; min-height: 64px; padding: 10px 20px;
    background: none; border: none;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    cursor: pointer; font-family: inherit; text-align: left;
    transition: background 0.12s; position: relative;
  }
  .atp-row:last-child { border-bottom: none; }
  .atp-row:hover:not(:disabled) { background: rgba(255,255,255,0.04); }
  .atp-row:disabled  { cursor: default; }
  .atp-row--added    { background: rgba(34,197,94,0.05); }
  .atp-row--added:hover { background: rgba(34,197,94,0.07); }
  .atp-row--error    { background: rgba(248,113,113,0.05); }
  .atp-row--error:hover:not(:disabled) { background: rgba(248,113,113,0.08); }
  .atp-row--loading  { opacity: 0.7; cursor: default; }

  .atp-row__dot-wrap {
    width: 40px; height: 40px; border-radius: 10px; overflow: hidden; flex-shrink: 0;
  }
  .atp-row__dot-img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .atp-row__dot     { width: 100%; height: 100%; border-radius: 10px; opacity: 0.85; }

  .atp-row__info { flex: 1; min-width: 0; }
  .atp-row__name {
    color: #e5e7eb; font-size: 14px; font-weight: 500; margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    letter-spacing: -0.01em;
  }
  .atp-row--added .atp-row__name { color: #86efac; }
  .atp-row--error .atp-row__name { color: #fca5a5; }
  .atp-row__meta {
    color: #6b7280; font-size: 12px; margin: 3px 0 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .atp-row--error .atp-row__meta { color: #f87171; }

  .atp-row__indicator {
    color: #4b5563; display: flex; align-items: center; flex-shrink: 0;
    transition: color 0.15s;
  }
  .atp-row:hover:not(:disabled) .atp-row__indicator { color: #9ca3af; }
  .atp-row--added .atp-row__indicator { color: #22c55e; }
  .atp-row--added .atp-row__indicator svg {
    animation: atp-check-pop 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards;
  }

  /* ── Animations ── */
  @keyframes atp-check-pop {
    0%   { transform: scale(0.5); opacity: 0; }
    60%  { transform: scale(1.25); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes atp-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* ── Very small screens ── */
  @media (max-width: 380px) {
    .atp-song-header,
    .atp-new-playlist-row,
    .atp-row { padding-left: 16px; padding-right: 16px; }
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     TABLET  (640px–1023px) — centered modal, vertically centered
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  @media (min-width: 640px) and (max-width: 1023px) {
    .atp-backdrop {
      align-items: center;
      padding: 24px;
    }
    .atp-panel {
      height: auto;
      max-height: min(680px, calc(100vh - 48px));
      max-width: 480px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.09);
      box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4);
      padding-bottom: 20px;
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                  opacity   0.25s ease;
    }
    .atp-panel--out { transform: scale(0.94); opacity: 0; }
    .atp-panel--in  { transform: scale(1);    opacity: 1; }
    .atp-header {
      padding-top: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
  }

  /* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
     DESKTOP  (≥1024px) — RIGHT SIDE DRAWER, slides in from right edge
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
  @media (min-width: 1024px) {
    .atp-backdrop {
      align-items: stretch;
      justify-content: flex-end;
      padding: 0;
    }
    .atp-panel {
      width: 360px;
      height: 100%;
      max-height: 100vh;
      border-radius: 0;
      border-left: 1px solid rgba(255,255,255,0.09);
      box-shadow: -8px 0 32px rgba(0,0,0,0.5);
      padding-bottom: 24px;
      background: #141414;
      transform: translateX(100%);
      opacity: 1;
      transition: transform 0.28s cubic-bezier(0.32, 0.72, 0, 1);
    }
    .atp-panel--out { transform: translateX(100%); }
    .atp-panel--in  { transform: translateX(0);    }
    .atp-header {
      padding-top: 16px;
      padding-bottom: 14px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
    }
    .atp-song-header { padding: 16px 20px; }
    .atp-row { min-height: 60px; padding: 10px 20px; }
    .atp-new-playlist-row { padding: 14px 20px; }
  }
`;

export default AddToPlaylist;