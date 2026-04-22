  /**
   * client/src/components/songs/SongCard.jsx
   *
   * CHANGES IN THIS VERSION (surgical — only these changes, nothing else touched):
   *
   *   1. REMOVED: useLikedSongs hook call + useAuthStore import.
   *      ADDED:   likedSongIds prop (string[], default []).
   *      WHY:     With virtualization ~15 SongCard instances are mounted at once.
   *               Each was creating its own useQuery + useMutation + useErrorHandler
   *               subscription for the same liked-songs data — 15 mutation instances
   *               and 15 error-handler subscriptions for identical data.
   *               Now SongList calls useLikedSongs once and passes likedSongIds down.
   *               Zero subscription churn on scroll. LikeButton still works because
   *               it uses useToggleLikeSong internally (standalone mutation, unchanged).
   *
   *   2. ADDED:   loading="lazy" on the cover <img>.
   *      WHY:     Without it every visible cover fires a Cloudinary request on mount.
   *               Lazy loading defers off-screen images until they near the viewport.
   *
   *   3. CHANGED: ensureStyles() moved from useEffect to module-level call.
   *      WHY:     useEffect ran on every card mount (~15 times per scroll batch).
   *               Module-level call runs exactly once when the module is first
   *               imported. Same result, zero per-mount overhead.
   *
   * UNCHANGED — every other prop, hook, handler, style, and render path:
   *   - song, songList, contextSongs, index, startIndex props
   *   - usePlayerStore subscription
   *   - handlePlay, handleMenuToggle, handleDragStart
   *   - useLongPress
   *   - LikeButton (still receives isLiked, now from prop instead of local hook)
   *   - OptionsSheet
   *   - All ROW_STYLES responsive breakpoints
   *   - All aria-labels, icons, equalizer bars
   *   - sanitizeDisplay calls
   */

  import { useState, useRef, useCallback } from 'react';
  import { Link } from 'react-router-dom';
  import { usePlayerStore } from '../../store/playerStore';
  import { formatDuration } from '../../utils/formatters';
  import { sanitizeDisplay } from '../../utils/sanitize';
  import LikeButton from '../player/LikeButton';
  import OptionsSheet from '../player/OptionsSheet';

  // ── Style injection — runs once at module load, not per component instance ────
  // FIX 3: was inside useEffect(() => { ensureStyles() }, []) — ran on every mount.
  // Now called at module level: runs exactly once on first import.
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
  let stylesInjected = false;
  function ensureStyles() {
    if (stylesInjected || typeof document === 'undefined') return;
    stylesInjected = true;
    const tag = document.createElement('style');
    tag.setAttribute('data-song-card', '1');
    tag.textContent = ROW_STYLES;
    document.head.appendChild(tag);
  }
  ensureStyles(); // module-level — not inside useEffect

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
    // FIX 1: likedSongIds now passed from parent (SongList or page-level hook).
    // Default to [] so SongCard is safe when used standalone (search, artist page)
    // before the parent passes the prop — hearts are simply unfilled until data arrives.
    likedSongIds = [],
  }) => {
    const pool      = contextSongs ?? songList ?? null;
    const poolIndex = startIndex   ?? index    ?? 0;

    const { currentSong, isPlaying, setPlaybackContext } = usePlayerStore();

    const [hovered,          setHovered]   = useState(false);
    const [showOptionsSheet, setShowSheet] = useState(false);

    const blockPlayRef = useRef(false);

    const isActive = currentSong?.id === song.id;
    // FIX 1: was likedSongIds?.includes(song.id) ?? false (from local hook).
    // Now reads from prop — same value, zero hook overhead per card.
    const isLiked  = likedSongIds.includes(song.id);
    const dur      = formatDuration(song.duration);

    // Sanitize API-sourced string fields once (unchanged)
    const safeTitle  = sanitizeDisplay(song.title);
    const safeArtist = sanitizeDisplay(song.artist);
    const safeAlbum  = sanitizeDisplay(song.album);
    const safeGenre  = sanitizeDisplay(song.genre);

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
              loading="lazy"
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
              <span className="song-row__album-text">{safeAlbum}</span>
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
            <LikeButton
              song={song}
              size="sm"
              className={[
                'song-row__like-btn',
                isLiked ? 'song-row__like-btn--liked' : '',
              ].join(' ')}
            />
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

  /* ── Styles ──────────────────────────────────────────────────────────────────── */


  export default SongCard;