/**
 * client/src/components/player/OptionsSheet.jsx
 *
 * PERMANENT FIX — ReactDOM.createPortal
 *
 * ROOT CAUSE:
 *   position:fixed elements rendered inside ANY ancestor with overflow:hidden
 *   (or overflow:clip) are contained by that ancestor, not the viewport.
 *   App.jsx has two such ancestors. No CSS workaround can fix this.
 *
 * FIX:
 *   Wrap the entire render output in ReactDOM.createPortal(content, document.body).
 *   This physically moves the DOM nodes to document.body — completely outside
 *   the React app tree — so position:fixed correctly anchors to the viewport.
 *   All React context (hooks, state, event handlers) continues to work normally
 *   because portals only move DOM nodes, not the React component tree.
 *
 * RESPONSIVE BEHAVIOR (unchanged):
 *   Mobile  (<640px)   — full-width slide-up bottom sheet
 *   Tablet  (640–1023) — centered bottom sheet, max-width 480px
 *   Desktop (≥1024px)  — compact floating card, bottom-center, 420px, 24px from bottom
 *
 * Props: { song, isOpen, onClose } — unchanged.
 */

import { useState, useEffect, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import AddToPlaylist from '../playlists/AddToPlaylist';
import { useLikedSongs } from '../../hooks/useLikedSongs';
import useAuthStore from '../../store/authStore';
import useQueueStore from '../../store/queueStore';
import { useToast } from '../ui/Toast';

const OptionsSheet = memo(({ song, isOpen, onClose }) => {
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [visible,   setVisible]   = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  const navigate  = useNavigate();
  const { toast } = useToast();

  const user = useAuthStore((s) => s.user);
  const uid  = user?.uid;

  const { likedSongIds, toggleLike, isToggling } = useLikedSongs(uid);
  const addToQueue = useQueueStore((s) => s.addToQueue);

  const isLiked = !!song && likedSongIds.includes(song.id);

  // ── Animation lifecycle ───────────────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimateIn(true)),
      );
    } else {
      setAnimateIn(false);
      const t = setTimeout(() => {
        setVisible(false);
        setShowAddToPlaylist(false);
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ── Keyboard: Escape closes ───────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (showAddToPlaylist) setShowAddToPlaylist(false);
        else onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, showAddToPlaylist, onClose]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  const handleLike = useCallback(async () => {
    if (!uid || !song || isToggling) return;
    const wasLiked = likedSongIds.includes(song.id);
    try {
      await toggleLike(song.id);
      toast.success(wasLiked ? 'Removed from Liked Songs' : 'Added to Liked Songs ♥');
    } catch {
      toast.error('Something went wrong. Please try again.');
    }
  }, [uid, song, toggleLike, isToggling, likedSongIds, toast]);

  const handleAddToQueue = useCallback(() => {
    if (!song) return;
    addToQueue(song);
    toast.info(`"${song.title}" added to queue`);
    onClose();
  }, [song, addToQueue, toast, onClose]);

  const handleGoToArtist = useCallback(() => {
    if (song?.artistId) {
      navigate(`/artist/${song.artistId}`);
      onClose();
    }
  }, [song, navigate, onClose]);

  const handleGoToAlbum = useCallback(() => {
    if (song?.albumId) {
      navigate(`/album/${song.albumId}`);
      onClose();
    }
  }, [song, navigate, onClose]);

  if (!visible) return null;

  // ── PORTAL: render into document.body, completely outside app DOM tree ────
  return createPortal(
    <>
      <style>{SHEET_STYLES}</style>

      {/*
        AddToPlaylist also uses createPortal internally (see AddToPlaylist.jsx).
        z-index 10000 > OptionsSheet z-index 9999.
      */}
      {showAddToPlaylist && song && (
        <AddToPlaylist
          song={song}
          onClose={() => setShowAddToPlaylist(false)}
        />
      )}

      {/* ── Backdrop ── */}
      <div
        className="options-sheet__backdrop"
        style={{ '--backdrop-opacity': animateIn ? '0.55' : '0' }}
        onClick={onClose}
        role="presentation"
      >
        <div
          className={[
            'options-sheet__panel',
            animateIn ? 'options-sheet__panel--in' : '',
          ].join(' ')}
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Song options"
        >
          {/* Drag handle — hidden on desktop */}
          <div className="options-sheet__handle" aria-hidden="true" />

          {/* Song header */}
          {song && (
            <div className="options-sheet__header">
              <div className="options-sheet__cover-wrap">
                <img
                  src={song.coverUrl}
                  alt={song.title}
                  className="options-sheet__cover"
                  onError={(e) => {
                    e.target.src = 'https://placehold.co/48x48/111/555?text=♪';
                  }}
                />
              </div>
              <div className="options-sheet__song-info">
                <p className="options-sheet__song-title">{song.title}</p>
                <p className="options-sheet__song-artist">{song.artist}</p>
              </div>
              {uid && (
                <button
                  className={[
                    'options-sheet__header-heart',
                    isLiked ? 'options-sheet__header-heart--liked' : '',
                  ].join(' ')}
                  onClick={handleLike}
                  disabled={isToggling}
                  aria-label={isLiked ? 'Unlike' : 'Like'}
                  aria-pressed={isLiked}
                >
                  <HeartIcon filled={isLiked} />
                </button>
              )}
            </div>
          )}

          {/* Action rows */}
          {uid && (
            <OptionRow
              icon={<HeartIcon filled={isLiked} colored={isLiked} />}
              label={isLiked ? 'Unlike' : 'Like'}
              sublabel={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
              onClick={handleLike}
              disabled={isToggling}
              accent={isLiked}
            />
          )}

          <OptionRow
            icon={<QueueIcon />}
            label="Add to Queue"
            onClick={handleAddToQueue}
          />

          <OptionRow
            icon={<PlaylistAddIcon />}
            label="Add to Playlist"
            onClick={() => setShowAddToPlaylist(true)}
          />

          <OptionRow
            icon={<ArtistIcon />}
            label="Go to Artist"
            sublabel={song?.artistId ? song.artist : 'Not available'}
            onClick={handleGoToArtist}
            disabled={!song?.artistId}
          />

          <OptionRow
            icon={<AlbumIcon />}
            label="Go to Album"
            sublabel={song?.albumId ? song.album : 'Not available'}
            onClick={handleGoToAlbum}
            disabled={!song?.albumId}
          />

          {/* Cancel */}
          <button className="options-sheet__cancel" onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body,
  );
});

OptionsSheet.displayName = 'OptionsSheet';

// ── OptionRow ─────────────────────────────────────────────────────────────────
const OptionRow = ({ icon, label, sublabel, onClick, disabled, accent }) => (
  <button
    className={[
      'options-sheet__row',
      disabled ? 'options-sheet__row--disabled' : '',
      accent   ? 'options-sheet__row--accent'   : '',
    ].join(' ')}
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
  >
    <span className="options-sheet__row-icon">{icon}</span>
    <div className="options-sheet__row-text">
      <p className="options-sheet__row-label">{label}</p>
      {sublabel && (
        <p className="options-sheet__row-sublabel">{sublabel}</p>
      )}
    </div>
    <span className="options-sheet__row-chevron" aria-hidden="true">
      <ChevronSmallIcon />
    </span>
  </button>
);

// ── Icons ─────────────────────────────────────────────────────────────────────
const HeartIcon = ({ filled, colored }) => (
  <svg width="20" height="20" viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
    style={colored ? { color: '#ef4444' } : undefined}
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06
             a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78
             1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const QueueIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8"  y1="6"  x2="21" y2="6"  />
    <line x1="8"  y1="12" x2="21" y2="12" />
    <line x1="8"  y1="18" x2="21" y2="18" />
    <line x1="3"  y1="6"  x2="3.01" y2="6"  />
    <line x1="3"  y1="12" x2="3.01" y2="12" />
    <line x1="3"  y1="18" x2="3.01" y2="18" />
  </svg>
);

const PlaylistAddIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5"  y1="12" x2="19" y2="12" />
  </svg>
);

const ArtistIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const AlbumIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3"  />
  </svg>
);

const ChevronSmallIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

// ── Styles ────────────────────────────────────────────────────────────────────
const SHEET_STYLES = `
  /* ── Backdrop ──────────────────────────────────────────────────────────── */
  .options-sheet__backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    background: rgba(0, 0, 0, var(--backdrop-opacity, 0));
    transition: background 0.3s;
  }

  /* ── Panel — mobile-first base ─────────────────────────────────────────── */
  .options-sheet__panel {
    position: relative;
    width: 100%;
    background: #161616;
    border-top: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px 20px 0 0;
    padding: 12px 0 env(safe-area-inset-bottom, 24px);
    font-family: 'Inter', -apple-system, sans-serif;

    /* Slide-up animation */
    transform: translateY(100%);
    transition: transform 0.3s cubic-bezier(0.32, 0.72, 0, 1);

    clip-path: inset(0 round 20px 20px 0 0);
  }

  .options-sheet__panel--in {
    transform: translateY(0);
  }

  /* ── Drag handle ───────────────────────────────────────────────────────── */
  .options-sheet__handle {
    width: 36px;
    height: 4px;
    background: #3a3a3a;
    border-radius: 2px;
    margin: 0 auto 14px;
  }

  /* ── Song header ────────────────────────────────────────────────────────── */
  .options-sheet__header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 20px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.06);
    margin-bottom: 6px;
  }

  .options-sheet__cover-wrap {
    width: 46px;
    height: 46px;
    border-radius: 8px;
    overflow: hidden;
    background: #111;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .options-sheet__cover {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }

  .options-sheet__song-info { flex: 1; min-width: 0; }
  .options-sheet__song-title {
    color: #f3f4f6; font-size: 14px; font-weight: 600; margin: 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .options-sheet__song-artist {
    color: #6b7280; font-size: 12px; margin: 2px 0 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  .options-sheet__header-heart {
    background: none; border: none; cursor: pointer;
    width: 36px; height: 36px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%; flex-shrink: 0;
    color: #6b7280;
    transition: background 0.15s, transform 0.15s;
  }
  .options-sheet__header-heart:hover  { background: rgba(255,255,255,0.06); }
  .options-sheet__header-heart--liked { color: #ef4444; }
  .options-sheet__header-heart:disabled { opacity: 0.4; cursor: default; }

  /* ── Action rows ────────────────────────────────────────────────────────── */
  .options-sheet__row {
    display: flex;
    align-items: center;
    gap: 14px;
    width: 100%;
    padding: 13px 20px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: background 0.12s;
    position: relative;
  }
  .options-sheet__row:hover:not(:disabled) {
    background: rgba(255,255,255,0.04);
  }
  .options-sheet__row--disabled {
    cursor: default;
    opacity: 0.35;
  }
  .options-sheet__row-icon {
    color: #9ca3af; flex-shrink: 0; display: flex;
  }
  .options-sheet__row--accent .options-sheet__row-icon { color: #ef4444; }
  .options-sheet__row-text { flex: 1; min-width: 0; }
  .options-sheet__row-label {
    color: #f3f4f6; font-size: 15px; font-weight: 500; margin: 0;
  }
  .options-sheet__row--accent .options-sheet__row-label { color: #f87171; }
  .options-sheet__row-sublabel {
    color: #6b7280; font-size: 12px; margin: 2px 0 0;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .options-sheet__row-chevron {
    color: #374151;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    transition: color 0.12s;
  }
  .options-sheet__row:hover:not(:disabled) .options-sheet__row-chevron {
    color: #6b7280;
  }

  /* ── Cancel button ──────────────────────────────────────────────────────── */
  .options-sheet__cancel {
    display: block;
    width: calc(100% - 40px);
    margin: 10px 20px 0;
    padding: 13px;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    color: #9ca3af;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, color 0.15s;
  }
  .options-sheet__cancel:hover {
    background: rgba(255,255,255,0.09);
    color: #e5e7eb;
  }

  /* ── Tablet (≥640px): centered, anchored to bottom ─────────────────────── */
  @media (min-width: 640px) {
    .options-sheet__panel {
      max-width: 480px;
      border-radius: 20px 20px 0 0;
      clip-path: inset(0 round 20px 20px 0 0);
    }
  }

  /* ── Desktop (≥1024px): floating centered card ──────────────────────────── */
  @media (min-width: 1024px) {
    .options-sheet__backdrop {
      padding-bottom: 24px;
    }

    .options-sheet__panel {
      max-width: 420px;
      border-radius: 16px;
      border: 1px solid rgba(255,255,255,0.08);
      box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4);
      padding-bottom: 16px;

      transform: translateY(20px) scale(0.97);
      opacity: 0;
      transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1),
                  opacity   0.25s ease;

      clip-path: inset(0 round 16px);
    }

    .options-sheet__panel--in {
      transform: translateY(0) scale(1);
      opacity: 1;
    }

    .options-sheet__handle {
      display: none;
    }

    .options-sheet__row {
      padding: 11px 20px;
    }
  }
`;

export default OptionsSheet;