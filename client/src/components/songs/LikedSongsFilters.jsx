import { useMemo } from "react";

/**
 * LikedSongsFilters
 * Genre chips + sort dropdown + group toggle.
 * Pure client-side — no API calls.
 */

const GENRE_COLORS = {
  pop:        { bg: "rgba(236,72,153,0.15)",  border: "rgba(236,72,153,0.4)",  text: "#f472b6" },
  rock:       { bg: "rgba(239,68,68,0.15)",   border: "rgba(239,68,68,0.4)",   text: "#f87171" },
  jazz:       { bg: "rgba(245,158,11,0.15)",  border: "rgba(245,158,11,0.4)",  text: "#fbbf24" },
  classical:  { bg: "rgba(99,102,241,0.15)",  border: "rgba(99,102,241,0.4)",  text: "#818cf8" },
  "hip-hop":  { bg: "rgba(168,85,247,0.15)",  border: "rgba(168,85,247,0.4)",  text: "#c084fc" },
  hiphop:     { bg: "rgba(168,85,247,0.15)",  border: "rgba(168,85,247,0.4)",  text: "#c084fc" },
  hip_hop:    { bg: "rgba(168,85,247,0.15)",  border: "rgba(168,85,247,0.4)",  text: "#c084fc" },
  rnb:        { bg: "rgba(20,184,166,0.15)",  border: "rgba(20,184,166,0.4)",  text: "#2dd4bf" },
  electronic: { bg: "rgba(6,182,212,0.15)",   border: "rgba(6,182,212,0.4)",   text: "#22d3ee" },
  indie:      { bg: "rgba(132,204,22,0.15)",  border: "rgba(132,204,22,0.4)",  text: "#a3e635" },
  folk:       { bg: "rgba(251,146,60,0.15)",  border: "rgba(251,146,60,0.4)",  text: "#fb923c" },
  peace:      { bg: "rgba(34,197,94,0.15)",   border: "rgba(34,197,94,0.4)",   text: "#4ade80" },
  soul:       { bg: "rgba(234,179,8,0.15)",   border: "rgba(234,179,8,0.4)",   text: "#facc15" },
  metal:      { bg: "rgba(100,116,139,0.15)", border: "rgba(100,116,139,0.4)", text: "#94a3b8" },
  country:    { bg: "rgba(217,119,6,0.15)",   border: "rgba(217,119,6,0.4)",   text: "#f59e0b" },
};

const DEFAULT_GENRE_COLOR = {
  bg: "rgba(75,85,99,0.18)",
  border: "rgba(75,85,99,0.4)",
  text: "#9ca3af",
};

export const getGenreColor = (genre) =>
  GENRE_COLORS[(genre || "").toLowerCase()] ?? DEFAULT_GENRE_COLOR;

const SORT_OPTIONS = [
  { value: "default",  label: "Recently Liked" },
  { value: "az",       label: "A – Z" },
  { value: "duration", label: "Duration" },
  { value: "genre",    label: "Genre" },
];

const LikedSongsFilters = ({
  songs,
  activeGenre,
  onGenreChange,
  sortBy,
  onSortChange,
  groupByGenre,
  onGroupToggle,
}) => {
  const genres = useMemo(() => {
    const counts = {};
    songs.forEach((s) => { if (s.genre) counts[s.genre] = (counts[s.genre] || 0) + 1; });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([genre, count]) => ({ genre, count }));
  }, [songs]);

  if (!genres.length) return null;

  return (
    <div className="ls-filters">
      {/* Genre chips */}
      <div className="ls-chips" role="group" aria-label="Filter by genre">
        <button
          className={`ls-chip ${!activeGenre ? "ls-chip--active" : ""}`}
          onClick={() => onGenreChange(null)}
          aria-pressed={!activeGenre}
        >
          All
        </button>
        {genres.map(({ genre, count }) => {
          const color = getGenreColor(genre);
          const isActive = activeGenre === genre;
          return (
            <button
              key={genre}
              className={`ls-chip ${isActive ? "ls-chip--genre-active" : ""}`}
              style={isActive ? { background: color.bg, borderColor: color.border, color: color.text } : {}}
              onClick={() => onGenreChange(isActive ? null : genre)}
              aria-pressed={isActive}
            >
              {genre}
              <span className="ls-chip__count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Right controls */}
      <div className="ls-controls">
        <div className="ls-sort-wrap">
          <SortIcon />
          <select
            className="ls-sort-select"
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sort songs"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          className={`ls-group-btn ${groupByGenre ? "ls-group-btn--active" : ""}`}
          onClick={onGroupToggle}
          aria-pressed={groupByGenre}
          title="Group by genre"
        >
          <LayersIcon />
          <span className="ls-group-btn__label">Group</span>
        </button>
      </div>
    </div>
  );
};

const SortIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 6h18M7 12h10M11 18h2" />
  </svg>
);
const LayersIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

export default LikedSongsFilters;