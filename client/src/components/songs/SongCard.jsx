/**
 * client/src/components/songs/SongCard.jsx
 *
 * PRODUCTION CHANGE: long-press fallback for mobile (feature #9 — drag to playlist).
 *
 * What changed:
 *  - useLongPress hook added (inline, no dep) — fires after 500ms hold on touch devices.
 *  - Long-press on mobile opens the context menu (setMenuOpen(true)), which already has
 *    "Add to Playlist". This is the correct mobile pattern since HTML5 drag API
 *    does not fire touch events reliably on iOS/Android.
 *  - Desktop drag behaviour is unchanged (not implemented here to avoid scope creep —
 *    drag-to-playlist from Search.jsx is handled there via dragStart/dragEnd events).
 *  - draggable="true" attribute added so desktop users can drag the row into a playlist
 *    sidebar target (the sidebar drop-zone is handled in Sidebar.jsx).
 *  - onDragStart sets dataTransfer with song.id so the drop target can read it.
 *
 * What did NOT change:
 *  - All existing handlers: handlePlay, handleLike, handleMenuToggle — identical.
 *  - All store interactions: playerStore, queueStore, authStore — identical.
 *  - All icon components, equalizer animation — identical.
 *  - All styles — identical.
 *  - Props contract: { song, songList, index } — identical.
 */

import { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useQueueStore } from '../../store/queueStore';
import { useAuthStore } from '../../store/authStore';
import { useLikedSongs } from '../../hooks/useLikedSongs';
import { formatDuration } from '../../utils/formatters';
import AddToPlaylist from '../playlists/AddToPlaylist';

// ─── Long-press hook (mobile context-menu trigger) ────────────────────────────
/**
 * Returns touch event props to attach to a container.
 * After `delay` ms of uninterrupted press, calls `onLongPress`.
 * Cancels if the finger moves more than 10px (scroll intent).
 *
 * @param {() => void} onLongPress
 * @param {number}     [delay=500]
 */
function useLongPress(onLongPress, delay = 500) {
  const timerRef  = useRef(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  const start = useCallback(
    (e) => {
      // Only handle single-touch
      if (e.touches && e.touches.length !== 1) return;
      startXRef.current = e.touches?.[0]?.clientX ?? 0;
      startYRef.current = e.touches?.[0]?.clientY ?? 0;
      timerRef.current = setTimeout(() => {
        onLongPress();
      }, delay);
    },
    [onLongPress, delay]
  );

  const cancel = useCallback(() => {
    clearTimeout(timerRef.current);
  }, []);

  const move = useCallback(
    (e) => {
      if (!e.touches) return;
      const dx = Math.abs(e.touches[0].clientX - startXRef.current);
      const dy = Math.abs(e.touches[0].clientY - startYRef.current);
      // Cancel if the user is scrolling (moved >10px)
      if (dx > 10 || dy > 10) cancel();
    },
    [cancel]
  );

  return {
    onTouchStart: start,
    onTouchEnd:   cancel,
    onTouchMove:  move,
    onTouchCancel: cancel,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
const SongCard = ({ song, songList, index }) => {
  const { playSong, currentSong, isPlaying } = usePlayerStore();
  const { setQueue } = useQueueStore();
  const { user: currentUser } = useAuthStore();

  const { likedSongs = [], toggleLike } = useLikedSongs(currentUser?.uid);

  const [hovered,         setHovered]         = useState(false);
  const [liking,          setLiking]           = useState(false);
  const [showAddToPlaylist, setShowAdd]        = useState(false);
  const [menuOpen,        setMenuOpen]         = useState(false);

  const isActive = currentSong?.id === song.id;
  const isLiked  = likedSongs.includes(song.id);
  const dur      = formatDuration(song.duration);

  // ── Long-press → open context menu on mobile ────────────────────────────────
  const longPressProps = useLongPress(() => {
    setMenuOpen(true);
  }, 500);

  // ── Handlers — UNCHANGED from original ─────────────────────────────────────
  const handlePlay = (e) => {
    e.stopPropagation();
    const idx = songList ? songList.findIndex((s) => s.id === song.id) : 0;
    if (songList) {
      setQueue(songList, idx !== -1 ? idx : 0);
    } else {
      playSong(song, [song]);
    }
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!currentUser || liking) return;
    setLiking(true);
    try {
      await toggleLike(song.id);
    } catch (err) {
      console.error('Like failed:', err.message || err);
    } finally {
      setLiking(false);
    }
  };

  const handleMenuToggle = (e) => {
    e.stopPropagation();
    setMenuOpen((v) => !v);
  };

  const handleMenuClose = (e) => {
    e.stopPropagation();
    setMenuOpen(false);
  };

  // ── Drag-and-drop (desktop) — sets song.id on dataTransfer ─────────────────
  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', song.id);
    e.dataTransfer.effectAllowed = 'copy';
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{ROW_STYLES}</style>

      <div
        className={[
          'song-row',
          isActive  ? 'song-row--active'  : '',
          hovered   ? 'song-row--hovered' : '',
        ].join(' ')}
        onClick={handlePlay}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
        role="button"
        tabIndex={0}
        aria-label={`Play ${song.title} by ${song.artist}`}
        onKeyDown={(e) => e.key === 'Enter' && handlePlay(e)}
        // Desktop drag
        draggable="true"
        onDragStart={handleDragStart}
        // Mobile long-press
        {...longPressProps}
      >
        {/* ── Col 1: Row number / equalizer ──────────────────────────────── */}
        <div className="song-row__index" aria-hidden="true">
          {isActive && isPlaying ? (
            <EqualizerBars />
          ) : (
            <span className="song-row__num">
              {hovered ? <PlayIcon /> : index != null ? index + 1 : ''}
            </span>
          )}
        </div>

        {/* ── Col 2: Cover art ───────────────────────────────────────────── */}
        <div className="song-row__cover-wrap">
          <img
            src={song.coverUrl || 'https://placehold.co/48x48/111/444?text=♪'}
            alt={song.title}
            className="song-row__cover"
            onError={(e) => { e.target.src = 'https://placehold.co/48x48/111/444?text=♪'; }}
          />
        </div>

        {/* ── Col 3: Title + Artist ──────────────────────────────────────── */}
        <div className="song-row__meta">
          <span className={['song-row__title', isActive ? 'song-row__title--active' : ''].join(' ')}>
            {song.title}
          </span>
          {song.artistId ? (
            <Link
              to={`/artist/${song.artistId}`}
              className="song-row__artist song-row__artist--link"
              onClick={(e) => e.stopPropagation()}
              title={`View ${song.artist}`}
            >
              {song.artist}
            </Link>
          ) : (
            <span className="song-row__artist">{song.artist}</span>
          )}
        </div>

        {/* ── Col 4: Album — hidden on mobile ────────────────────────────── */}
        <div className="song-row__album song-row__album--responsive">
          {song.albumId ? (
            <Link
              to={`/album/${song.albumId}`}
              className="song-row__album-text song-row__album-text--link"
              onClick={(e) => e.stopPropagation()}
              title={`View ${song.album}`}
            >
              {song.album}
            </Link>
          ) : (
            <span className="song-row__album-text">
              {song.album || <span className="song-row__album-empty">—</span>}
            </span>
          )}
        </div>

        {/* ── Col 5: Genre badge — hidden on mobile ──────────────────────── */}
        <div className="song-row__genre-col song-row__genre--responsive">
          {song.genre ? (
            <span className="song-row__genre">{song.genre}</span>
          ) : (
            <span className="song-row__album-empty">—</span>
          )}
        </div>

        {/* ── Col 6: Duration ────────────────────────────────────────────── */}
        <div className="song-row__dur-col">
          {dur && dur !== '0:00' && <span className="song-row__dur">{dur}</span>}
        </div>

        {/* ── Col 7: Like + Menu ─────────────────────────────────────────── */}
        <div className="song-row__actions">
          {currentUser && (
            <button
              onClick={handleLike}
              disabled={liking}
              className={[
                'song-row__icon-btn song-row__like-btn',
                isLiked             ? 'song-row__like-btn--liked'    : '',
                hovered || isLiked  ? 'song-row__icon-btn--visible'  : '',
              ].join(' ')}
              title={isLiked ? 'Unlike' : 'Like'}
              aria-label={isLiked ? 'Unlike' : 'Like'}
            >
              <HeartIcon filled={isLiked} />
            </button>
          )}

          <div className="song-row__menu-wrap">
            <button
              onClick={handleMenuToggle}
              className={[
                'song-row__icon-btn song-row__menu-btn',
                hovered ? 'song-row__icon-btn--visible' : '',
              ].join(' ')}
              title="More options"
              aria-label="More options"
              aria-expanded={menuOpen}
            >
              <DotsIcon />
            </button>

            {menuOpen && (
              <div
                className="song-row__dropdown"
                role="menu"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  className="song-row__dropdown-item"
                  role="menuitem"
                  onClick={(e) => { handleMenuClose(e); handlePlay(e); }}
                >
                  Play
                </button>
                <button
                  className="song-row__dropdown-item"
                  role="menuitem"
                  onClick={(e) => { handleMenuClose(e); setShowAdd(true); }}
                >
                  Add to playlist
                </button>
                <button
                  className="song-row__dropdown-item"
                  role="menuitem"
                  onClick={(e) => { handleMenuClose(e); handleLike(e); }}
                >
                  {isLiked ? 'Unlike' : 'Like'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {showAddToPlaylist && (
        <AddToPlaylist song={song} onClose={() => setShowAdd(false)} />
      )}
    </>
  );
};

/* ── Icons ──────────────────────────────────────────────────────────────────── */
const HeartIcon = ({ filled }) => (
  <svg width="15" height="15" viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor" strokeWidth="2"
    strokeLinecap="round" strokeLinejoin="round"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);

const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="19" cy="12" r="1.5" />
  </svg>
);

const EqualizerBars = () => (
  <span className="song-row__eq" aria-label="Now playing">
    <span className="song-row__eq-bar" style={{ animationDelay: '0ms'   }} />
    <span className="song-row__eq-bar" style={{ animationDelay: '160ms' }} />
    <span className="song-row__eq-bar" style={{ animationDelay: '80ms'  }} />
    <span className="song-row__eq-bar" style={{ animationDelay: '240ms' }} />
  </span>
);

/* ── Styles — identical to original ─────────────────────────────────────────── */
const ROW_STYLES = `
  .song-row {
    display: grid;
    grid-template-columns: 32px 48px 1fr 1fr 100px 52px 80px;
    align-items: center;
    gap: 12px;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    border-left: 3px solid transparent;
    transition: background 0.15s ease, border-color 0.15s ease;
    position: relative;
    min-height: 60px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .song-row:focus-visible {
    outline: 2px solid #22c55e;
    outline-offset: 2px;
  }

  .song-row--hovered  { background: rgba(255,255,255,0.05); }
  .song-row--active   { border-left-color: #22c55e; background: rgba(34,197,94,0.06); }

  .song-row__index {
    display: flex; align-items: center; justify-content: center; min-width: 32px;
  }
  .song-row__num {
    font-size: 13px; color: #4b5563; font-variant-numeric: tabular-nums;
    display: flex; align-items: center; justify-content: center;
  }
  .song-row--hovered .song-row__num { color: #fff; }

  .song-row__cover-wrap {
    width: 48px; height: 48px; flex-shrink: 0;
    border-radius: 6px; overflow: hidden; background: #111;
  }
  .song-row__cover { width: 100%; height: 100%; object-fit: cover; display: block; }

  .song-row__meta { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

  .song-row__title {
    font-size: 14px; font-weight: 500; color: #e5e7eb;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.3;
  }
  .song-row__title--active { color: #22c55e; }

  .song-row__artist {
    font-size: 12px; color: #6b7280;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    text-decoration: none; background: none;
  }
  .song-row__artist--link {
    cursor: pointer; color: #9ca3af; transition: color 0.15s ease;
  }
  .song-row__artist--link:hover {
    color: #e5e7eb; text-decoration: underline; text-underline-offset: 2px;
  }

  .song-row__album { min-width: 0; }
  .song-row__album-text {
    font-size: 13px; color: #4b5563;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: block; text-decoration: none;
  }
  .song-row__album-text--link { cursor: pointer; color: #6b7280; transition: color 0.15s ease; }
  .song-row__album-text--link:hover {
    color: #d1d5db; text-decoration: underline; text-underline-offset: 2px;
  }
  .song-row__album-empty { color: #374151; font-size: 13px; }

  .song-row__genre-col { display: flex; align-items: center; }
  .song-row__genre {
    background: rgba(34,197,94,0.08); color: #22c55e;
    border: 1px solid rgba(34,197,94,0.18); border-radius: 4px;
    padding: 2px 8px; font-size: 11px; font-weight: 500;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    max-width: 96px; display: inline-block;
  }

  .song-row__dur-col { display: flex; align-items: center; justify-content: flex-end; }
  .song-row__dur {
    font-size: 13px; color: #4b5563;
    font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
  }

  .song-row__actions { display: flex; align-items: center; justify-content: flex-end; gap: 4px; }

  .song-row__icon-btn {
    background: none; border: none; cursor: pointer; color: #6b7280;
    width: 32px; height: 32px; display: flex; align-items: center;
    justify-content: center; border-radius: 50%;
    transition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
    opacity: 0; flex-shrink: 0; padding: 0;
  }
  .song-row__icon-btn--visible { opacity: 1; }
  .song-row__icon-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
  .song-row__icon-btn:disabled { cursor: default; opacity: 0.4; }
  .song-row__like-btn--liked { color: #f43f5e; opacity: 1 !important; }
  .song-row__like-btn--liked:hover { color: #fb7185; background: rgba(244,63,94,0.1); }

  .song-row__menu-wrap { position: relative; }
  .song-row__dropdown {
    position: absolute; right: 0; top: calc(100% + 4px);
    background: #1f2937; border: 1px solid #374151;
    border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
    z-index: 50; min-width: 148px; overflow: hidden;
    animation: song-dropdown-in 0.12s ease;
  }
  @keyframes song-dropdown-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  .song-row__dropdown-item {
    display: block; width: 100%; text-align: left; padding: 9px 14px;
    font-size: 13px; color: #d1d5db; background: none; border: none;
    cursor: pointer; transition: background 0.1s ease, color 0.1s ease; font-family: inherit;
  }
  .song-row__dropdown-item:hover { background: rgba(255,255,255,0.07); color: #fff; }

  .song-row__eq { display: flex; align-items: flex-end; gap: 2px; height: 16px; }
  .song-row__eq-bar {
    width: 3px; border-radius: 1px; background: #22c55e;
    animation: song-eq-bounce 0.7s ease-in-out infinite alternate;
  }
  .song-row__eq-bar:nth-child(1) { height: 40%; }
  .song-row__eq-bar:nth-child(2) { height: 100%; }
  .song-row__eq-bar:nth-child(3) { height: 65%; }
  .song-row__eq-bar:nth-child(4) { height: 30%; }
  @keyframes song-eq-bounce {
    from { transform: scaleY(0.3); }
    to   { transform: scaleY(1); }
  }

  @media (max-width: 1023px) {
    .song-row { grid-template-columns: 32px 48px 1fr 100px 52px 72px; }
    .song-row__album--responsive { display: none; }
  }
  @media (max-width: 639px) {
    .song-row { grid-template-columns: 32px 44px 1fr 48px 64px; gap: 8px; padding: 5px 8px; }
    .song-row__album--responsive { display: none; }
    .song-row__genre--responsive { display: none; }
    .song-row__icon-btn           { opacity: 1; }
    .song-row__cover-wrap         { width: 44px; height: 44px; }
  }

  .song-row + .song-row { border-top: 1px solid rgba(255,255,255,0.04); }
`;

export default SongCard;