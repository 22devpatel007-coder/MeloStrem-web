import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";
import { useLikedSongs } from "../../hooks/useLikedSongs";
import { getGenreColor } from "./LikedSongsFilters";

/**
 * LikedSongsTable — FIXED
 *
 * ✅ Store API fix: Row play is handled via `onPlaySong(song, index)` callback
 *    passed from LikedSongs.jsx. The page owns all playerStore calls.
 *    No direct store imports — no more "setCurrentSong is not a function".
 *
 * ✅ Row 1 overlap fix: Removed position:sticky from thead. The filters bar
 *    is sticky; the table head scrolls normally to avoid z-index stacking
 *    issues that caused row 1 to hide behind the header.
 *
 * ✅ NEW badge: moved to bottom-right of cover so it never clips the title.
 */

const formatDuration = (secs) => {
  if (!secs && secs !== 0) return "—";
  const m = Math.floor(secs / 60);
  const s = String(Math.floor(secs % 60)).padStart(2, "0");
  return `${m}:${s}`;
};

const sortSongs = (songs, sortBy) => {
  const arr = [...songs];
  switch (sortBy) {
    case "az":       return arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "duration": return arr.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    case "genre":    return arr.sort((a, b) => (a.genre || "").localeCompare(b.genre || ""));
    default:         return arr;
  }
};

const buildGenreGroups = (songs) => {
  const groups = {};
  songs.forEach((s) => {
    const g = s.genre || "Other";
    if (!groups[g]) groups[g] = [];
    groups[g].push(s);
  });
  return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
};

// ── SongRow ────────────────────────────────────────────────────────────────
const SongRow = ({ song, displayIndex, isNew, isCurrentlyPlaying, onPlaySong, onToggleLike, isLiked }) => {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      className={`ls-row ${isCurrentlyPlaying ? "ls-row--playing" : ""}`}
      style={{ animationDelay: `${displayIndex * 40}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onDoubleClick={onPlaySong}
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onPlaySong()}
      aria-label={`${song.title || "Unknown"} by ${song.artist || "Unknown"}`}
    >
      {/* # / Play */}
      <td className="ls-td ls-td--num">
        {hovered || isCurrentlyPlaying ? (
          <button className={`ls-play-btn ${isCurrentlyPlaying ? "ls-play-btn--active" : ""}`} onClick={onPlaySong} aria-label={`Play ${song.title}`}>
            {isCurrentlyPlaying ? <PauseIcon /> : <PlayIcon />}
          </button>
        ) : (
          <span className="ls-row-num">{displayIndex + 1}</span>
        )}
      </td>

      {/* Cover + Title + Artist */}
      <td className="ls-td ls-td--title">
        <div className="ls-song-info">
          <div className="ls-cover-wrap">
            {song.coverUrl ? (
              <img src={song.coverUrl} alt={`${song.title} cover`} className="ls-cover" loading="lazy" draggable={false} />
            ) : (
              <div className="ls-cover ls-cover--fallback" aria-hidden="true"><MusicNoteIcon /></div>
            )}
            {isNew && <span className="ls-new-badge" aria-label="Recently liked">NEW</span>}
          </div>
          <div className="ls-song-meta">
            <span className={`ls-song-title ${isCurrentlyPlaying ? "ls-song-title--playing" : ""}`}>
              {song.title || "Unknown"}
            </span>
            <span className="ls-song-artist">
              {song.artistId ? (
                <Link to={`/artist/${song.artistId}`} className="ls-artist-link" onClick={(e) => e.stopPropagation()}>
                  {song.artist || "Unknown Artist"}
                </Link>
              ) : (song.artist || "Unknown Artist")}
            </span>
          </div>
        </div>
      </td>

      {/* Album */}
      <td className="ls-td ls-td--album ls-td--hide-sm">
        {song.albumId ? (
          <Link to={`/album/${song.albumId}`} className="ls-album-link" onClick={(e) => e.stopPropagation()}>
            {song.album || "—"}
          </Link>
        ) : (
          <span className="ls-muted">{song.album || "—"}</span>
        )}
      </td>

      {/* Genre */}
      <td className="ls-td ls-td--hide-md">
        {song.genre ? <GenreChip genre={song.genre} /> : <span className="ls-muted">—</span>}
      </td>

      {/* Time + Unlike */}
      <td className="ls-td ls-td--right">
        <div className="ls-td-end">
          <button
            className={`ls-unlike-btn ${hovered ? "ls-unlike-btn--visible" : ""} ${isLiked ? "ls-unlike-btn--liked" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleLike(); }}
            aria-label={isLiked ? "Remove from liked" : "Add to liked"}
          >
            <HeartIcon filled={isLiked} />
          </button>
          <span className="ls-duration">{formatDuration(song.duration)}</span>
        </div>
      </td>
    </tr>
  );
};

// ── GenreChip ──────────────────────────────────────────────────────────────
export const GenreChip = ({ genre }) => {
  const color = getGenreColor(genre);
  return (
    <span className="ls-genre-chip" style={{ background: color.bg, borderColor: color.border, color: color.text }}>
      {genre}
    </span>
  );
};

// ── Table shell ────────────────────────────────────────────────────────────
const SongTable = ({ songs, newIds, currentSongId, isGloballyPlaying, onPlaySong, onToggleLike, likedSongIds }) => (
  <table className="ls-table" role="table">
    <thead>
      <tr className="ls-thead-row">
        <th className="ls-th ls-th--num" scope="col">#</th>
        <th className="ls-th" scope="col">TITLE</th>
        <th className="ls-th ls-th--hide-sm" scope="col">ALBUM</th>
        <th className="ls-th ls-th--hide-md" scope="col">GENRE</th>
        <th className="ls-th ls-th--right" scope="col">TIME</th>
      </tr>
    </thead>
    <tbody>
      {songs.map((song, i) => (
        <SongRow
          key={song.id}
          song={song}
          displayIndex={i}
          isNew={newIds.has(song.id)}
          isCurrentlyPlaying={currentSongId === song.id && isGloballyPlaying}
          isLiked={likedSongIds.includes(song.id)}
          onPlaySong={() => onPlaySong(song, i, songs)}
          onToggleLike={() => onToggleLike(song.id)}
        />
      ))}
    </tbody>
  </table>
);

// ── Main export ────────────────────────────────────────────────────────────
const LikedSongsTable = ({
  songs,
  sortBy,
  activeGenre,
  groupByGenreEnabled,
  currentSongId,
  isGloballyPlaying,
  onPlaySong,
}) => {
  const { user } = useAuthStore();
  const { likedSongIds, toggleLike } = useLikedSongs(user?.uid);

  const filtered = useMemo(
    () => (activeGenre ? songs.filter((s) => s.genre === activeGenre) : songs),
    [songs, activeGenre]
  );
  const sorted = useMemo(() => sortSongs(filtered, sortBy), [filtered, sortBy]);
  // Top-3 "new" = first 3 in original server order
  const newIds = useMemo(() => new Set(songs.slice(0, 3).map((s) => s.id)), [songs]);

  if (!sorted.length) {
    return (
      <div className="ls-empty-filter">
        <span className="ls-empty-filter__icon" aria-hidden="true">🎵</span>
        <p className="ls-empty-filter__text">No songs match this filter.</p>
        <p className="ls-empty-filter__sub">Try a different genre or clear the filter.</p>
      </div>
    );
  }

  if (groupByGenreEnabled) {
    const groups = buildGenreGroups(sorted);
    return (
      <div className="ls-table-wrap">
        {groups.map(([genre, groupSongs]) => (
          <section key={genre} className="ls-genre-group">
            <div className="ls-genre-group__header">
              <GenreChip genre={genre} />
              <span className="ls-genre-group__count">{groupSongs.length} songs</span>
            </div>
            <SongTable
              songs={groupSongs}
              newIds={newIds}
              currentSongId={currentSongId}
              isGloballyPlaying={isGloballyPlaying}
              onPlaySong={onPlaySong}
              onToggleLike={toggleLike}
              likedSongIds={likedSongIds}
            />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="ls-table-wrap">
      <SongTable
        songs={sorted}
        newIds={newIds}
        currentSongId={currentSongId}
        isGloballyPlaying={isGloballyPlaying}
        onPlaySong={onPlaySong}
        onToggleLike={toggleLike}
        likedSongIds={likedSongIds}
      />
    </div>
  );
};

// ── Icons ──────────────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);
const PauseIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" />
  </svg>
);
const HeartIcon = ({ filled }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "#f43f5e" : "none"} stroke={filled ? "#f43f5e" : "currentColor"} strokeWidth="2" aria-hidden="true">
    <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.09C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 14 21 12 21Z" />
  </svg>
);
const MusicNoteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
  </svg>
);

export default LikedSongsTable;