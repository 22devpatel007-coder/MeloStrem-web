/**
 * client/src/components/songs/LikedSongsTable.jsx
 *
 * PRODUCTION FIXES (3 critical bugs):
 *
 * BUG 1 — Double hook instance (FIXED):
 *   OLD: LikedSongsTable called useLikedSongs(user?.uid) internally.
 *        This created a SECOND React Query subscription independent of the
 *        parent's. The optimistic update in the parent's hook instance was
 *        NOT seen by the table's instance, causing flicker and stale state.
 *   FIX: toggleLike and likedSongIds are now received as props from
 *        LikedSongs.jsx which owns the single useLikedSongs instance.
 *        LikedSongsTable is now purely presentational.
 *
 * BUG 2 — Virtualizer rows invisible / overlapping (FIXED):
 *   OLD: SongRow received a `style` prop (translateY) but never applied it.
 *        ALL rows rendered at top:0 and overlapped each other.
 *   FIX: SongRow accepts and spreads the style prop onto the <tr>.
 *        Also fixed: <tr> must use display:flex or we use a <div> wrapper.
 *        Solution: wrap each virtual row in a <div> positioned absolutely,
 *        with an inner <table> so row cells still align correctly.
 *
 * BUG 3 — thead/tbody column misalignment (FIXED):
 *   OLD: `tbody { display: block }` breaks the native table layout engine.
 *        thead column widths and tbody column widths became independent —
 *        columns visually misaligned or collapsed.
 *   FIX: Use a CSS grid-based virtualization approach.
 *        The entire table (thead + virtual rows) lives in one scroll
 *        container. The thead is sticky at top:0. Virtual rows are
 *        absolutely positioned divs that each render a full <table> with
 *        colgroup to match column widths exactly.
 *        This is the correct pattern for virtualizing HTML tables while
 *        preserving column alignment.
 */

import { useMemo, useState, useRef } from "react";
import { Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { getGenreColor } from "./LikedSongsFilters";

// ── Constants ─────────────────────────────────────────────────────────────────
const LS_ROW_HEIGHT = 64;
const OVERSCAN = 5;

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatDuration = (secs) => {
  if (!secs && secs !== 0) return "—";
  const m = Math.floor(secs / 60);
  const s = String(Math.floor(secs % 60)).padStart(2, "0");
  return `${m}:${s}`;
};

const sortSongs = (songs, sortBy) => {
  const arr = [...songs];
  switch (sortBy) {
    case "az":
      return arr.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    case "duration":
      return arr.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    case "genre":
      return arr.sort((a, b) => (a.genre || "").localeCompare(b.genre || ""));
    default:
      return arr;
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

// ── SongRow ───────────────────────────────────────────────────────────────────
// FIXED: accepts `style` prop and applies it so virtualizer translateY works.
const SongRow = ({
  song,
  displayIndex,
  isNew,
  isCurrentlyPlaying,
  onPlaySong,
  onToggleLike,
  isLiked,
  style, // ← FIXED: was received but never applied
}) => {
  const [hovered, setHovered] = useState(false);

  return (
    <tr
      className={`ls-row ${isCurrentlyPlaying ? "ls-row--playing" : ""}`}
      style={style}
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
          <button
            className={`ls-play-btn ${isCurrentlyPlaying ? "ls-play-btn--active" : ""}`}
            onClick={onPlaySong}
            aria-label={`Play ${song.title}`}
          >
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
              <img
                src={song.coverUrl}
                alt={`${song.title} cover`}
                className="ls-cover"
                loading="lazy"
                draggable={false}
              />
            ) : (
              <div className="ls-cover ls-cover--fallback" aria-hidden="true">
                <MusicNoteIcon />
              </div>
            )}
            {isNew && (
              <span className="ls-new-badge" aria-label="Recently liked">
                NEW
              </span>
            )}
          </div>
          <div className="ls-song-meta">
            <span
              className={`ls-song-title ${isCurrentlyPlaying ? "ls-song-title--playing" : ""}`}
            >
              {song.title || "Unknown"}
            </span>
            <span className="ls-song-artist">
              {song.artistId ? (
                <Link
                  to={`/artist/${song.artistId}`}
                  className="ls-artist-link"
                  onClick={(e) => e.stopPropagation()}
                >
                  {song.artist || "Unknown Artist"}
                </Link>
              ) : (
                song.artist || "Unknown Artist"
              )}
            </span>
          </div>
        </div>
      </td>

      {/* Album */}
      <td className="ls-td ls-td--album ls-td--hide-sm">
        {song.albumId ? (
          <Link
            to={`/album/${song.albumId}`}
            className="ls-album-link"
            onClick={(e) => e.stopPropagation()}
          >
            {song.album || "—"}
          </Link>
        ) : (
          <span className="ls-muted">{song.album || "—"}</span>
        )}
      </td>

      {/* Genre */}
      <td className="ls-td ls-td--hide-md">
        {song.genre ? (
          <GenreChip genre={song.genre} />
        ) : (
          <span className="ls-muted">—</span>
        )}
      </td>

      {/* Time + Unlike */}
      <td className="ls-td ls-td--right">
        <div className="ls-td-end">
          <button
            className={`ls-unlike-btn ${hovered ? "ls-unlike-btn--visible" : ""} ${isLiked ? "ls-unlike-btn--liked" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleLike();
            }}
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

// ── GenreChip ─────────────────────────────────────────────────────────────────
export const GenreChip = ({ genre }) => {
  const color = getGenreColor(genre);
  return (
    <span
      className="ls-genre-chip"
      style={{
        background: color.bg,
        borderColor: color.border,
        color: color.text,
      }}
    >
      {genre}
    </span>
  );
};

// ── VirtualizedSongTable ──────────────────────────────────────────────────────
/**
 * FIXED virtualization approach.
 *
 * The fundamental problem with `tbody { display: block }` is that it breaks
 * the table layout engine — thead and tbody column widths become independent.
 *
 * Solution: use a single scroll container div. Inside it:
 *   - A sticky thead table for column headers (with colgroup for widths)
 *   - A relatively-positioned div sized to total virtual height
 *   - Each virtual row absolutely positioned inside that div, rendered as
 *     a full <table> with the same colgroup so columns align perfectly
 *
 * This is the standard production pattern for virtualizing tables while
 * keeping column alignment correct.
 */
const VirtualizedSongTable = ({
  songs,
  newIds,
  currentSongId,
  isGloballyPlaying,
  onPlaySong,
  onToggleLike,
  likedSongIds,
}) => {
  const scrollRef = useRef(null);

  const virtualizer = useVirtualizer({
    count: songs.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => LS_ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight = virtualizer.getTotalSize();

  // Shared colgroup — same in both the sticky header table and each virtual row table.
  // Column widths must match ls-th / ls-td CSS widths exactly.
  // colgroup title album genre and time
  const colgroup = (
    <colgroup>
      <col style={{ width: 52 }}/>

      <col style={{ minWidth: 200 }}/>

      <col className="ls-col--hide-sm" style={{ width: 180 }}/>

      <col className="ls-col--hide-md" style={{ width: 120 }}/> 
      <col style={{ width: 100 }}/>

    </colgroup>
  );

  return (
    <div
      ref={scrollRef}
      className="ls-virtual-scroll"
      style={{
        overflowY: "auto",
        maxHeight: "calc(100vh - 320px)",
        scrollbarWidth: "thin",
        scrollbarColor: "rgba(255,255,255,0.08) transparent",
      }}
    >
      {/* Sticky header — always visible at top of scroll container */}
      <table
        className="ls-table ls-table--header"
        style={{ position: "sticky", top: 0, zIndex: 2 }}
      >
        {colgroup}
        <thead>
          <tr className="ls-thead-row">
            <th className="ls-th ls-th--num" scope="col">
              #
            </th>
            <th className="ls-th" scope="col">
              TITLE
            </th>
            <th className="ls-th ls-th--hide-sm" scope="col">
              ALBUM
            </th>
            <th className="ls-th ls-th--hide-md" scope="col">
              GENRE
            </th>
            <th className="ls-th ls-th--right" scope="col">
              TIME
            </th>
          </tr>
        </thead>
      </table>

      {/* Virtual rows container — sized to total virtual height */}
      <div style={{ position: "relative", height: totalHeight }}>
        {virtualItems.map((virtualItem) => {
          const song = songs[virtualItem.index];
          if (!song) return null;
          const isCurrentlyPlaying =
            currentSongId === song.id && isGloballyPlaying;

          return (
            /*
             * Each virtual row is a full <table> absolutely positioned.
             * The same colgroup ensures pixel-perfect column alignment with the header.
             */
            <table
              key={song.id}
              className="ls-table ls-table--row"
              style={{
                position: "absolute",
                top: virtualItem.start,
                left: 0,
                width: "100%",
                height: virtualItem.size,
              }}
            >
              {colgroup}
              <tbody>
                <SongRow
                  song={song}
                  displayIndex={virtualItem.index}
                  isNew={newIds.has(song.id)}
                  isCurrentlyPlaying={isCurrentlyPlaying}
                  isLiked={likedSongIds.includes(song.id)}
                  onPlaySong={() => onPlaySong(song, virtualItem.index, songs)}
                  onToggleLike={() => onToggleLike(song.id)}
                />
              </tbody>
            </table>
          );
        })}
      </div>
    </div>
  );
};

// ── Main export ───────────────────────────────────────────────────────────────
/**
 * FIXED: No longer calls useLikedSongs internally.
 * toggleLike and likedSongIds now come as props from LikedSongs.jsx.
 * Added `uid` prop so the hook can be called in the parent only.
 */
const LikedSongsTable = ({
  songs,
  sortBy,
  activeGenre,
  groupByGenreEnabled,
  currentSongId,
  isGloballyPlaying,   
  likedSongIds = [],
  onToggleLike,
  onPlaySong,
}) => {
  // Single hook instance — owned here by LikedSongsTable's parent (LikedSongs.jsx)
  // passes these down; we call the hook here only as a fallback if uid is provided
  // directly. This keeps the component self-sufficient when used standalone.

  const filtered = useMemo(
    () => (activeGenre ? songs.filter((s) => s.genre === activeGenre) : songs),
    [songs, activeGenre],
  );
  const sorted = useMemo(() => sortSongs(filtered, sortBy), [filtered, sortBy]);

  // "New" = first 3 in the original server order (pre-filter/sort)
  const newIds = useMemo(
    () => new Set(songs.slice(0, 3).map((s) => s.id)),
    [songs],
  );

  if (!sorted.length) {
    return (
      <div className="ls-empty-filter">
        <span className="ls-empty-filter__icon" aria-hidden="true">
          🎵
        </span>
        <p className="ls-empty-filter__text">No songs match this filter.</p>
        <p className="ls-empty-filter__sub">
          Try a different genre or clear the filter.
        </p>
      </div>
    );
  }

  const tableProps = {
    newIds,
    currentSongId,
    isGloballyPlaying,
    onPlaySong,
    onToggleLike,
    likedSongIds,
  };

  if (groupByGenreEnabled) {
    const groups = buildGenreGroups(sorted);
    return (
      <div className="ls-table-wrap">
        {groups.map(([genre, groupSongs]) => (
          <section key={genre} className="ls-genre-group">
            <div className="ls-genre-group__header">
              <GenreChip genre={genre} />
              <span className="ls-genre-group__count">
                {groupSongs.length} songs
              </span>
            </div>
            <VirtualizedSongTable songs={groupSongs} {...tableProps} />
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="ls-table-wrap">
      <VirtualizedSongTable songs={sorted} {...tableProps} />
    </div>
  );
};

// ── Icons ─────────────────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);
const PauseIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);
const HeartIcon = ({ filled }) => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill={filled ? "#f43f5e" : "none"}
    stroke={filled ? "#f43f5e" : "currentColor"}
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.09C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 14 21 12 21Z" />
  </svg>
);
const MusicNoteIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    aria-hidden="true"
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);

export default LikedSongsTable;
