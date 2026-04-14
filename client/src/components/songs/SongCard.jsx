/**
 * client/src/components/songs/SongCard.jsx
 *
 * Phase 1 — Task 1.2: sanitizeDisplay() applied to all API-sourced string
 * render points.
 *
 * Changes from previous version (SURGICAL — only render sites changed):
 *
 *   1. Import sanitizeDisplay from '../../utils/sanitize'
 *
 *   2. Compute sanitized display values once at the top of the component
 *      (before any JSX) so they are available to all render paths:
 *        safeTitle   = sanitizeDisplay(song.title)
 *        safeArtist  = sanitizeDisplay(song.artist)
 *        safeAlbum   = sanitizeDisplay(song.album)
 *        safeGenre   = sanitizeDisplay(song.genre)
 *
 *   3. Replace raw `song.title` / `song.artist` / `song.album` / `song.genre`
 *      in JSX text nodes with their safe equivalents.
 *
 *   4. aria-label on the row also uses safeTitle + safeArtist.
 *
 *   5. alt text on cover image uses safeTitle.
 *
 * Everything else is IDENTICAL to the previous version:
 *   - All props, hooks, event handlers, CSS classes: untouched
 *   - ensureStyles singleton, ROW_STYLES, longPressProps: untouched
 *   - OptionsSheet, LikeButton, Link hrefs: untouched
 *   - Playback logic (handlePlay, handleMenuToggle): untouched
 *   - song.artistId / song.albumId null-safe Link/span logic: untouched
 *   - Equalizer bars, equalizer animation: untouched
 *   - Responsive breakpoints: untouched
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePlayerStore } from '../../store/playerStore';
import { useAuthStore } from '../../store/authStore';
import { useLikedSongs } from '../../hooks/useLikedSongs';
import { formatDuration } from '../../utils/formatters';
import { sanitizeDisplay } from '../../utils/sanitize'; // ← Task 1.2
import LikeButton from '../player/LikeButton';
import OptionsSheet from '../player/OptionsSheet';

// ── Style injection singleton ─────────────────────────────────────────────────
let stylesInjected = false;
function ensureStyles() {
  if (stylesInjected || typeof document === 'undefined') return;
  stylesInjected = true;
  const tag = document.createElement('style');
  tag.setAttribute('data-song-card', '1');
  tag.textContent = ROW_STYLES;
  document.head.appendChild(tag);
}

// ── useLongPress ──────────────────────────────────────────────────────────────
function useLongPress(onLongPress, delay = 500) {
  const timerRef  = useRef(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);

  const start = useCallback((e) => {
    if (e.touches && e.touches.length !== 1) return;
    startXRef.current = e.touches?.[0]?.clientX ?? 0;
    startYRef.current = e.touches?.[0]?.clientY ?? 0;
    timerRef.current  = setTimeout(onLongPress, delay);
  }, [onLongPress, delay]);

  const cancel = useCallback(() => clearTimeout(timerRef.current), []);

  const move = useCallback((e) => {
    if (!e.touches) return;
    const dx = Math.abs(e.touches[0].clientX - startXRef.current);
    const dy = Math.abs(e.touches[0].clientY - startYRef.current);
    if (dx > 10 || dy > 10) cancel();
  }, [cancel]);

  return {
    onTouchStart:  start,
    onTouchEnd:    cancel,
    onTouchMove:   move,
    onTouchCancel: cancel,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────
const SongCard = ({
  song,
  songList,
  contextSongs,
  index,
  startIndex,
}) => {
  const pool      = contextSongs ?? songList ?? null;
  const poolIndex = startIndex   ?? index    ?? 0;

  const { currentSong, isPlaying, setPlaybackContext } = usePlayerStore();
  const { user: currentUser } = useAuthStore();
  const { likedSongIds }      = useLikedSongs(currentUser?.uid);

  const [hovered,          setHovered]   = useState(false);
  const [showOptionsSheet, setShowSheet] = useState(false);

  const blockPlayRef = useRef(false);

  useEffect(() => { ensureStyles(); }, []);

  const isActive = currentSong?.id === song.id;
  const isLiked  = likedSongIds?.includes(song.id) ?? false;
  const dur      = formatDuration(song.duration);

  // ── Task 1.2: Sanitize all API-sourced string fields once ─────────────────
  // Computed here (not inline in JSX) so every render path gets the same
  // sanitized value without repeated function calls.
  const safeTitle  = sanitizeDisplay(song.title);
  const safeArtist = sanitizeDisplay(song.artist);
  const safeAlbum  = sanitizeDisplay(song.album);
  const safeGenre  = sanitizeDisplay(song.genre);
  // ─────────────────────────────────────────────────────────────────────────

  const longPressProps = useLongPress(
    useCallback(() => setShowSheet(true), []),
    500,
  );

  // ── Play ──────────────────────────────────────────────────────────────────
  const handlePlay = useCallback((e) => {
    e.stopPropagation();
    if (blockPlayRef.current) return;

    const safePool = Array.isArray(pool) && pool.length > 0 ? pool : [song];
    const idx      = safePool.findIndex((s) => s.id === song.id);
    const safeIdx  = idx >= 0 ? idx : poolIndex;

    setPlaybackContext('library', null, safePool, safeIdx);
  }, [song, pool, poolIndex, setPlaybackContext]);

  // ── ⋯ button — opens OptionsSheet on ALL devices ─────────────────────────
  const handleMenuToggle = useCallback((e) => {
    e.stopPropagation();
    blockPlayRef.current = true;
    setShowSheet(true);
    requestAnimationFrame(() => { blockPlayRef.current = false; });
  }, []);

  const handleDragStart = useCallback((e) => {
    e.dataTransfer.setData('text/plain', song.id);
    e.dataTransfer.effectAllowed = 'copy';
  }, [song.id]);

  return (
    <>
      <div
        className={[
          'song-row',
          isActive ? 'song-row--active'  : '',
          hovered  ? 'song-row--hovered' : '',
        ].join(' ')}
        onClick={handlePlay}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        role="button"
        tabIndex={0}
        aria-label={`Play ${safeTitle} by ${safeArtist}`}
        onKeyDown={(e) => e.key === 'Enter' && handlePlay(e)}
        draggable="true"
        onDragStart={handleDragStart}
        {...longPressProps}
      >
        {/* Col 1: Index / equalizer */}
        <div className="song-row__index" aria-hidden="true">
          {isActive && isPlaying ? (
            <EqualizerBars />
          ) : (
            <span className="song-row__num">
              {hovered ? <PlayIcon /> : poolIndex != null ? poolIndex + 1 : ''}
            </span>
          )}
        </div>

        {/* Col 2: Cover */}
        <div className="song-row__cover-wrap">
          <img
            src={song.coverUrl || 'https://placehold.co/48x48/111/444?text=♪'}
            alt={safeTitle}
            className="song-row__cover"
            onError={(e) => { e.target.src = 'https://placehold.co/48x48/111/444?text=♪'; }}
          />
        </div>

        {/* Col 3: Title + Artist */}
        <div className="song-row__meta">
          <span className={['song-row__title', isActive ? 'song-row__title--active' : ''].join(' ')}>
            {safeTitle}
          </span>
          {song.artistId ? (
            <Link
              to={`/artist/${song.artistId}`}
              className="song-row__artist song-row__artist--link"
              onClick={(e) => e.stopPropagation()}
              title={`View ${safeArtist}`}
            >
              {safeArtist}
            </Link>
          ) : (
            <span className="song-row__artist">{safeArtist}</span>
          )}
        </div>

        {/* Cols 4–6: hidden on mobile via display:none in responsive CSS */}
        <div className="song-row__album song-row__album--responsive" aria-hidden="true">
          {song.albumId ? (
            <Link
              to={`/album/${song.albumId}`}
              className="song-row__album-text song-row__album-text--link"
              onClick={(e) => e.stopPropagation()}
            >
              {safeAlbum}
            </Link>
          ) : (
            <span className="song-row__album-text">
              {safeAlbum || <span className="song-row__album-empty">—</span>}
            </span>
          )}
        </div>

        <div className="song-row__genre-col song-row__genre--responsive" aria-hidden="true">
          {safeGenre
            ? <span className="song-row__genre">{safeGenre}</span>
            : <span className="song-row__album-empty">—</span>}
        </div>

        <div className="song-row__dur-col" aria-hidden="true">
          {dur && dur !== '0:00' && <span className="song-row__dur">{dur}</span>}
        </div>

        {/* Col 7: Actions — always visible */}
        <div className="song-row__actions">
          {currentUser && (
            <LikeButton
              song={song}
              size="sm"
              className={[
                'song-row__like-btn',
                isLiked ? 'song-row__like-btn--liked' : '',
              ].join(' ')}
            />
          )}
          <div className="song-row__menu-wrap">
            <button
              onClick={handleMenuToggle}
              className="song-row__icon-btn song-row__menu-btn"
              title="More options"
              aria-label="More options"
              aria-haspopup="dialog"
            >
              <DotsIcon />
            </button>
          </div>
        </div>
      </div>

      {showOptionsSheet && (
        <OptionsSheet
          song={song}
          isOpen={showOptionsSheet}
          onClose={() => setShowSheet(false)}
        />
      )}
    </>
  );
};

/* ── Icons ──────────────────────────────────────────────────────────────────── */
const PlayIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);

const DotsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="5"  cy="12" r="1.5" />
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

/* ── Styles (injected once via ensureStyles(), not per-instance) ─────────────── */
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
    box-sizing: border-box;
  }

  .song-row:focus-visible {
    outline: 2px solid #22c55e;
    outline-offset: 2px;
  }

  .song-row--hovered { background: rgba(255,255,255,0.05); }
  .song-row--active  { border-left-color: #22c55e; background: rgba(34,197,94,0.06); }

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

  .song-row__actions {
    display: flex; align-items: center; justify-content: flex-end; gap: 2px;
  }

  .song-row .like-btn { color: #4b5563; width: 32px; height: 32px; }
  .song-row .like-btn:hover:not(:disabled) {
    color: #9ca3af; background: rgba(255,255,255,0.07);
  }
  .song-row .like-btn--liked,
  .song-row .song-row__like-btn--liked { color: #ef4444 !important; }

  .song-row__icon-btn {
    background: none; border: none; cursor: pointer; color: #4b5563;
    width: 32px; height: 32px; display: flex; align-items: center;
    justify-content: center; border-radius: 50%;
    transition: color 0.15s ease, background 0.15s ease;
    flex-shrink: 0; padding: 0;
  }
  .song-row__icon-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }
  .song-row__icon-btn:disabled { cursor: default; opacity: 0.4; }

  .song-row__menu-wrap { position: relative; }

  /* ── Equalizer ──────────────────────────────────────────────────────────── */
  .song-row__eq { display: flex; align-items: flex-end; gap: 2px; height: 16px; }
  .song-row__eq-bar {
    width: 3px; border-radius: 1px; background: #22c55e;
    animation: song-eq-bounce 0.7s ease-in-out infinite alternate;
  }
  .song-row__eq-bar:nth-child(1) { height: 40%;  }
  .song-row__eq-bar:nth-child(2) { height: 100%; }
  .song-row__eq-bar:nth-child(3) { height: 65%;  }
  .song-row__eq-bar:nth-child(4) { height: 30%;  }
  @keyframes song-eq-bounce {
    from { transform: scaleY(0.3); }
    to   { transform: scaleY(1); }
  }

  /* ── Responsive breakpoints ─────────────────────────────────────────────── */

  @media (max-width: 1023px) {
    .song-row { grid-template-columns: 32px 48px 1fr 100px 52px 72px; }
    .song-row__album--responsive { display: none; }
  }

  @media (max-width: 639px) {
    .song-row {
      grid-template-columns: 32px 44px 1fr 72px;
      gap: 8px;
      padding: 5px 8px;
    }
    .song-row__album--responsive { display: none; }
    .song-row__genre--responsive { display: none; }
    .song-row__dur-col           { display: none; }
    .song-row__cover-wrap        { width: 44px; height: 44px; }
    .song-row__icon-btn          { width: 36px; height: 36px; }
    .song-row .like-btn          { width: 36px !important; height: 36px !important; }
  }

  .song-row + .song-row { border-top: 1px solid rgba(255,255,255,0.04); }
`;

export default SongCard;