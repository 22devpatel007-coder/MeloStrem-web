/**
 * client/src/components/songs/SongCard.jsx
 *
 * UI REDESIGN: Horizontal row layout — Option 2
 * - Zero logic changes. All handlers, hooks, and store interactions preserved exactly.
 * - Layout: [#] [Cover + Play] [Title + Artist] [Album] [Genre] [Duration] [Like] [More]
 * - Album column is ready for future artist/album page links — just swap text for <Link>.
 * - Active row: green left border + animated equalizer bars instead of static cover.
 * - Hover: full row highlight, like button visible, three-dot menu visible.
 * - Mobile: album column hidden, genre hidden, duration moved inline.
 */

import { useState } from "react";
import { usePlayerStore } from "../../store/playerStore";
import { useQueueStore } from "../../store/queueStore";
import { useAuthStore } from "../../store/authStore";
import { useLikedSongs } from "../../hooks/useLikedSongs";
import { formatDuration } from "../../utils/formatters";
import AddToPlaylist from "../playlists/AddToPlaylist";

const SongCard = ({ song, songList, index }) => {
  const { playSong, currentSong, isPlaying } = usePlayerStore();
  const { setQueue } = useQueueStore();
  const { user: currentUser } = useAuthStore();

  const { likedSongs = [], toggleLike } = useLikedSongs(currentUser?.uid);

  const [hovered, setHovered] = useState(false);
  const [liking, setLiking] = useState(false);
  const [showAddToPlaylist, setShowAdd] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActive = currentSong?.id === song.id;
  const isLiked = likedSongs.includes(song.id);
  const dur = formatDuration(song.duration);

  // ── Handlers — UNCHANGED from original ──────────────────────────────────────
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
      console.error("Like failed:", err.message || err);
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

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{ROW_STYLES}</style>

      <div
        className={[
          "song-row",
          isActive ? "song-row--active" : "",
          hovered ? "song-row--hovered" : "",
        ].join(" ")}
        onClick={handlePlay}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setMenuOpen(false);
        }}
        role="button"
        tabIndex={0}
        aria-label={`Play ${song.title} by ${song.artist}`}
        onKeyDown={(e) => e.key === "Enter" && handlePlay(e)}
      >
        {/* ── Col 1: Row number / equalizer ────────────────────────────────── */}
        <div className="song-row__index" aria-hidden="true">
          {isActive && isPlaying ? (
            <EqualizerBars />
          ) : (
            <span className="song-row__num">
              {hovered ? <PlayIcon /> : index != null ? index + 1 : ""}
            </span>
          )}
        </div>

        {/* ── Col 2: Cover art ─────────────────────────────────────────────── */}
        <div className="song-row__cover-wrap">
          <img
            src={song.coverUrl || "https://placehold.co/48x48/111/444?text=♪"}
            alt={song.title}
            className="song-row__cover"
            onError={(e) => {
              e.target.src = "https://placehold.co/48x48/111/444?text=♪";
            }}
          />
        </div>

        {/* ── Col 3: Title + Artist ─────────────────────────────────────────── */}
        <div className="song-row__meta">
          <span
            className={[
              "song-row__title",
              isActive ? "song-row__title--active" : "",
            ].join(" ")}
          >
            {song.title}
          </span>
          {/*
           * FUTURE: Replace <span> with <Link to={`/artist/${song.artistId}`}>
           * when artist pages are implemented — no layout change needed.
           */}
          <span className="song-row__artist">{song.artist}</span>
        </div>

        {/* ── Col 4: Album — hidden on mobile ──────────────────────────────── */}
        <div className="song-row__album song-row__album--responsive">
          {/*
           * FUTURE: Replace <span> with <Link to={`/album/${song.albumId}`}>
           * when album pages are implemented — no layout change needed.
           */}
          <span className="song-row__album-text">
            {song.album || <span className="song-row__album-empty">—</span>}
          </span>
        </div>

        {/* ── Col 5: Genre badge — hidden on mobile ────────────────────────── */}
        <div className="song-row__genre-col song-row__genre--responsive">
          {song.genre ? (
            <span className="song-row__genre">{song.genre}</span>
          ) : (
            <span className="song-row__album-empty">—</span>
          )}
        </div>

        {/* ── Col 6: Duration ───────────────────────────────────────────────── */}
        <div className="song-row__dur-col">
          {dur && dur !== "0:00" && (
            <span className="song-row__dur">{dur}</span>
          )}
        </div>

        {/* ── Col 7: Like button ────────────────────────────────────────────── */}
        <div className="song-row__actions">
          {currentUser && (
            <button
              onClick={handleLike}
              disabled={liking}
              className={[
                "song-row__icon-btn song-row__like-btn",
                isLiked ? "song-row__like-btn--liked" : "",
                hovered || isLiked ? "song-row__icon-btn--visible" : "",
              ].join(" ")}
              title={isLiked ? "Unlike" : "Like"}
              aria-label={isLiked ? "Unlike" : "Like"}
            >
              <HeartIcon filled={isLiked} />
            </button>
          )}

          {/* ── Col 8: Three-dot menu ─────────────────────────────────────── */}
          <div className="song-row__menu-wrap">
            <button
              onClick={handleMenuToggle}
              className={[
                "song-row__icon-btn song-row__menu-btn",
                hovered ? "song-row__icon-btn--visible" : "",
              ].join(" ")}
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
                  onClick={(e) => {
                    handleMenuClose(e);
                    handlePlay(e);
                  }}
                >
                  Play
                </button>
                <button
                  className="song-row__dropdown-item"
                  role="menuitem"
                  onClick={(e) => {
                    handleMenuClose(e);
                    setShowAdd(true);
                  }}
                >
                  Add to Playlist
                </button>
                <button
                  className="song-row__dropdown-item"
                  role="menuitem"
                  onClick={(e) => {
                    handleMenuClose(e);
                    handleLike(e);
                  }}
                >
                  {isLiked ? "Unlike" : "Like"}
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
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
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

/* ── Animated equalizer bars (active + playing state) ───────────────────────── */
const EqualizerBars = () => (
  <span className="song-row__eq" aria-label="Now playing">
    <span className="song-row__eq-bar" style={{ animationDelay: "0ms" }} />
    <span className="song-row__eq-bar" style={{ animationDelay: "160ms" }} />
    <span className="song-row__eq-bar" style={{ animationDelay: "80ms" }} />
    <span className="song-row__eq-bar" style={{ animationDelay: "240ms" }} />
  </span>
);

/* ── Styles ─────────────────────────────────────────────────────────────────── */
const ROW_STYLES = `
  /* ── Row base ──────────────────────────────────────────────────────────── */
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

  .song-row--hovered {
    background: rgba(255, 255, 255, 0.05);
  }

  .song-row--active {
    border-left-color: #22c55e;
    background: rgba(34, 197, 94, 0.06);
  }

  /* ── Col 1: Index / equalizer ─────────────────────────────────────────── */
  .song-row__index {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 32px;
  }

  .song-row__num {
    font-size: 13px;
    color: #4b5563;
    font-variant-numeric: tabular-nums;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .song-row--hovered .song-row__num {
    color: #fff;
  }

  /* ── Col 2: Cover ─────────────────────────────────────────────────────── */
  .song-row__cover-wrap {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
    border-radius: 6px;
    overflow: hidden;
    background: #111;
  }

  .song-row__cover {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* ── Col 3: Title + Artist ────────────────────────────────────────────── */
  .song-row__meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .song-row__title {
    font-size: 14px;
    font-weight: 500;
    color: #e5e7eb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.3;
  }

  .song-row__title--active {
    color: #22c55e;
  }

  .song-row__artist {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    /* FUTURE: cursor: pointer; color: #9ca3af; when artist pages added */
  }

  /* ── Col 4: Album ─────────────────────────────────────────────────────── */
  .song-row__album {
    min-width: 0;
  }

  .song-row__album-text {
    font-size: 13px;
    color: #4b5563;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    display: block;
    /* FUTURE: cursor: pointer; color: #9ca3af; when album pages added */
  }

  .song-row__album-empty {
    color: #374151;
    font-size: 13px;
  }

  /* ── Col 5: Genre ─────────────────────────────────────────────────────── */
  .song-row__genre-col {
    display: flex;
    align-items: center;
  }

  .song-row__genre {
    background: rgba(34, 197, 94, 0.08);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.18);
    border-radius: 4px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 96px;
    display: inline-block;
  }

  /* ── Col 6: Duration ─────────────────────────────────────────────────── */
  .song-row__dur-col {
    display: flex;
    align-items: center;
    justify-content: flex-end;
  }

  .song-row__dur {
    font-size: 13px;
    color: #4b5563;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.02em;
  }

  /* ── Col 7: Action buttons ────────────────────────────────────────────── */
  .song-row__actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 4px;
  }

  .song-row__icon-btn {
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: color 0.15s ease, background 0.15s ease, opacity 0.15s ease;
    opacity: 0;
    flex-shrink: 0;
    padding: 0;
  }

  .song-row__icon-btn--visible {
    opacity: 1;
  }

  .song-row__icon-btn:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.08);
  }

  .song-row__icon-btn:disabled {
    cursor: default;
    opacity: 0.4;
  }

  .song-row__like-btn--liked {
    color: #f43f5e;
    opacity: 1 !important;
  }

  .song-row__like-btn--liked:hover {
    color: #fb7185;
    background: rgba(244, 63, 94, 0.1);
  }

  /* ── Dropdown menu ────────────────────────────────────────────────────── */
  .song-row__menu-wrap {
    position: relative;
  }

  .song-row__dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
    z-index: 50;
    min-width: 148px;
    overflow: hidden;
    animation: song-dropdown-in 0.12s ease;
  }

  @keyframes song-dropdown-in {
    from { opacity: 0; transform: translateY(-4px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)    scale(1);    }
  }

  .song-row__dropdown-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 9px 14px;
    font-size: 13px;
    color: #d1d5db;
    background: none;
    border: none;
    cursor: pointer;
    transition: background 0.1s ease, color 0.1s ease;
    font-family: inherit;
  }

  .song-row__dropdown-item:hover {
    background: rgba(255, 255, 255, 0.07);
    color: #fff;
  }

  /* ── Equalizer animation ──────────────────────────────────────────────── */
  .song-row__eq {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 16px;
  }

  .song-row__eq-bar {
    width: 3px;
    border-radius: 1px;
    background: #22c55e;
    animation: song-eq-bounce 0.7s ease-in-out infinite alternate;
  }

  .song-row__eq-bar:nth-child(1) { height: 40%; }
  .song-row__eq-bar:nth-child(2) { height: 100%; }
  .song-row__eq-bar:nth-child(3) { height: 65%; }
  .song-row__eq-bar:nth-child(4) { height: 30%; }

  @keyframes song-eq-bounce {
    from { transform: scaleY(0.3); }
    to   { transform: scaleY(1);   }
  }

  /* ── Responsive: tablet (hide album) ─────────────────────────────────── */
  @media (max-width: 1023px) {
    .song-row {
      grid-template-columns: 32px 48px 1fr 100px 52px 72px;
    }
    .song-row__album--responsive {
      display: none;
    }
  }

  /* ── Responsive: mobile (hide genre + album) ──────────────────────────── */
  @media (max-width: 639px) {
    .song-row {
      grid-template-columns: 32px 44px 1fr 48px 64px;
      gap: 8px;
      padding: 5px 8px;
    }
    .song-row__album--responsive  { display: none; }
    .song-row__genre--responsive  { display: none; }
    .song-row__icon-btn           { opacity: 1; }
    .song-row__cover-wrap         { width: 44px; height: 44px; }
  }

  /* ── Divider between rows (handled in SongList) ───────────────────────── */
  .song-row + .song-row {
    border-top: 1px solid rgba(255, 255, 255, 0.04);
  }
`;

export default SongCard;
