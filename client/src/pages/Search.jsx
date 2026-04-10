/**
 * client/src/pages/Search.jsx
 *
 * Production-ready. All 10 original features preserved.
 * Change from previous version: BROWSE_TILES (hardcoded genres) replaced with
 * real artist data derived from the already-fetched librarySongs cache.
 * Zero extra API calls. Zero new dependencies. Zero breaking changes.
 *
 * Features (all preserved):
 *  1.  Match highlighting           — HighlightedResult wraps title/artist in results.
 *  2.  Recent searches              — searchHistory util (try/catch safe localStorage).
 *  3.  Mood ring search bar         — border shifts: green (idle) → purple (fetching) → red (no results).
 *  4.  Skeleton shimmer             — 5 ghost rows while isLoading, no layout shift.
 *  5.  Sticky search bar on scroll  — IntersectionObserver on a sentinel div.
 *  6.  Client-side sort toggle      — Relevance / Title A–Z / Artist A–Z (useMemo).
 *  7.  Play all results             — Seeds queueStore + sets playerStore context to dynamic.
 *  8.  "/" keyboard shortcut        — Focuses search input safely.
 *  9.  Drag to playlist (desktop)   — Handled in SongCard.jsx (unchanged).
 * 10.  "Did you mean?" fuzzy        — fuzzyMatch against librarySongs page-1 cache.
 *
 * What changed vs the file you sent:
 *  - BROWSE_TILES constant removed.
 *  - extractUniqueArtists() added — pure function, derives artists from librarySongs.
 *  - Browse section now renders real ArtistBrowseCard tiles.
 *  - ArtistBrowseCard is a self-contained sub-component (no extra file needed).
 *  - Empty-state text updated: "Try browsing artists instead" (accurate now).
 *  - All other logic, hooks, state, styles — identical to what you sent.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SearchBar from '../components/search/SearchBar';
import SongCard from '../components/songs/SongCard';
import { useSearch } from '../hooks/useSearch';
import { useSongs } from '../hooks/useSongs';
import { usePlayerStore } from '../store/playerStore';
import { useQueueStore } from '../store/queueStore';
import { fuzzyMatch } from '../utils/fuzzyMatch';
import { readHistory, pushHistory, removeHistoryEntry, clearHistory } from '../utils/searchHistory';

// ─── Artist extraction ────────────────────────────────────────────────────────
/**
 * Derives unique artists from the library song pool.
 * - Deduplicates by artistId when available, falls back to artist name.
 * - Filters out songs with no artist name.
 * - Caps at `limit` to keep the browse grid manageable.
 *
 * @param {Array}  songs
 * @param {number} limit
 * @returns {{ id: string|null, name: string, coverUrl: string|null }[]}
 */
function extractUniqueArtists(songs, limit = 12) {
  if (!Array.isArray(songs) || !songs.length) return [];

  const seen = new Set();
  const artists = [];

  for (const song of songs) {
    const name = (song.artist || '').trim();
    if (!name) continue;

    // Use artistId as dedup key when available, otherwise artist name
    const key = song.artistId || name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    artists.push({
      id:       song.artistId || null,
      name,
      coverUrl: song.coverUrl || song.cover || null,
    });

    if (artists.length >= limit) break;
  }

  return artists;
}

// ─── Colour palette for artist tiles (cycles when artists > palette length) ──
const TILE_PALETTE = [
  { bg: 'rgba(124,58,237,0.18)',  accent: '#7c3aed' },
  { bg: 'rgba(220,38,38,0.18)',   accent: '#dc2626' },
  { bg: 'rgba(234,88,12,0.18)',   accent: '#ea580c' },
  { bg: 'rgba(219,39,119,0.18)',  accent: '#db2777' },
  { bg: 'rgba(8,145,178,0.18)',   accent: '#0891b2' },
  { bg: 'rgba(180,83,9,0.18)',    accent: '#b45309' },
  { bg: 'rgba(15,118,110,0.18)',  accent: '#0f766e' },
  { bg: 'rgba(67,56,202,0.18)',   accent: '#4338ca' },
  { bg: 'rgba(22,163,74,0.18)',   accent: '#16a34a' },
  { bg: 'rgba(2,132,199,0.18)',   accent: '#0284c7' },
  { bg: 'rgba(147,51,234,0.18)',  accent: '#9333ea' },
  { bg: 'rgba(190,18,60,0.18)',   accent: '#be123c' },
];

// ─── Artist browse tile ───────────────────────────────────────────────────────
/**
 * Renders a single artist card in the browse grid.
 * - Navigates to /artist/:id when artistId exists.
 * - Falls back to searching by artist name when no ID (legacy songs).
 * - Shows cover art thumbnail when available.
 */
const ArtistBrowseCard = ({ artist, index, onFallbackSearch }) => {
  const navigate   = useNavigate();
  const palette    = TILE_PALETTE[index % TILE_PALETTE.length];
  const initials   = artist.name.charAt(0).toUpperCase();

  const handleClick = () => {
    if (artist.id) {
      navigate(`/artist/${artist.id}`);
    } else {
      // No artistId (legacy song) — fall back to name search
      onFallbackSearch(artist.name);
    }
  };

  return (
    <button
      className="sp-tile"
      style={{ '--tile-bg': palette.bg, '--tile-accent': palette.accent }}
      onClick={handleClick}
      aria-label={`Browse ${artist.name}`}
      title={artist.id ? `Go to ${artist.name}` : `Search for ${artist.name}`}
    >
      {/* Cover art or initials avatar */}
      <div className="sp-tile__avatar">
        {artist.coverUrl ? (
          <img
            src={artist.coverUrl}
            alt={artist.name}
            className="sp-tile__avatar-img"
            loading="lazy"
            onError={(e) => {
              // If image fails, hide it so initials fallback shows
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        {/* Initials fallback — hidden when cover loads, visible when no cover or load error */}
        <div
          className="sp-tile__avatar-initials"
          style={{
            display: artist.coverUrl ? 'none' : 'flex',
            background: palette.accent,
          }}
        >
          {initials}
        </div>
      </div>

      <span className="sp-tile__label">{artist.name}</span>

      {/* Small indicator: arrow if has ID (navigates), search icon if no ID */}
      <span className="sp-tile__badge" aria-hidden="true">
        {artist.id ? '→' : '🔍'}
      </span>
    </button>
  );
};

// ─── Sort options ─────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'title',     label: 'Title A–Z'  },
  { key: 'artist',    label: 'Artist A–Z' },
];

// ─── Highlight helper ─────────────────────────────────────────────────────────
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function HighlightedResult({ text, query, style }) {
  if (!query || !text) return <span style={style}>{text}</span>;

  let pattern;
  try {
    pattern = new RegExp(`(${escapeRegex(query)})`, 'i');
  } catch {
    return <span style={style}>{text}</span>;
  }

  const parts = text.split(pattern);
  return (
    <span style={style}>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <strong key={i} style={{ color: '#22c55e', fontWeight: 700 }}>{part}</strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ─── Skeleton shimmer row ─────────────────────────────────────────────────────
const SkeletonRow = () => (
  <div className="sp-skeleton">
    <div className="sp-skeleton__cover sp-shimmer" />
    <div className="sp-skeleton__lines">
      <div className="sp-skeleton__line sp-skeleton__line--title sp-shimmer" />
      <div className="sp-skeleton__line sp-skeleton__line--artist sp-shimmer" />
    </div>
  </div>
);

// ─── Component ────────────────────────────────────────────────────────────────
const Search = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  const { data, isLoading, isError } = useSearch(query);
  const songs = data?.songs ?? [];

  // useSongs — page 1 only (already cached). Used for fuzzy fallback AND artist browse.
  // No extra API call — this data is already in React Query cache from Home page.
  const { songs: librarySongs } = useSongs(30);

  const { playSong, setPlaybackContext } = usePlayerStore();
  const { setQueueFromContext } = useQueueStore();

  // ── Derived: unique artists for browse grid ────────────────────────────────
  // useMemo so we don't re-derive on every render — only when librarySongs changes.
  const browseArtists = useMemo(
    () => extractUniqueArtists(librarySongs, 12),
    [librarySongs]
  );

  // ── Feature: sort ──────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState('relevance');

  const sortedSongs = useMemo(() => {
    if (!songs.length) return songs;
    if (sortKey === 'title')  return [...songs].sort((a, b) => (a.title  || '').localeCompare(b.title  || ''));
    if (sortKey === 'artist') return [...songs].sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    return songs; // relevance = server order
  }, [songs, sortKey]);

  // ── Feature: fuzzy "did you mean?" ────────────────────────────────────────
  const fuzzyDebounceRef = useRef(null);
  const [fuzzySuggestions, setFuzzySuggestions] = useState([]);

  useEffect(() => {
    clearTimeout(fuzzyDebounceRef.current);

    const hasQuery   = query.length >= 2;
    const noResults  = !isLoading && songs.length === 0;
    const hasLibrary = librarySongs.length > 0;

    if (!hasQuery || !noResults || !hasLibrary) {
      setFuzzySuggestions([]);
      return;
    }

    fuzzyDebounceRef.current = setTimeout(() => {
      const candidates = librarySongs.slice(0, 500);
      setFuzzySuggestions(fuzzyMatch(query, candidates, { maxResults: 3, threshold: 0.35 }));
    }, 150);

    return () => clearTimeout(fuzzyDebounceRef.current);
  }, [query, isLoading, songs.length, librarySongs]);

  // ── Feature: recent searches ───────────────────────────────────────────────
  const [history, setHistory] = useState(() => readHistory());

  const handleHistoryClick = useCallback((entry) => {
    pushHistory(entry);
    setHistory(readHistory());
    setSearchParams({ q: entry });
  }, [setSearchParams]);

  const handleHistoryDelete = useCallback((e, entry) => {
    e.stopPropagation();
    removeHistoryEntry(entry);
    setHistory(readHistory());
  }, []);

  const handleClearHistory = useCallback((e) => {
    e.stopPropagation();
    clearHistory();
    setHistory([]);
  }, []);

  useEffect(() => {
    if (query.length >= 2) {
      pushHistory(query);
      setHistory(readHistory());
    }
  }, [query]);

  // ── Feature: sticky search bar (IntersectionObserver) ─────────────────────
  const sentinelRef = useRef(null);
  const [isSticky, setIsSticky] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => setIsSticky(!entry.isIntersecting),
      { threshold: 0, rootMargin: '0px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // ── Feature: mood ring border color ───────────────────────────────────────
  const moodColor = useMemo(() => {
    if (isLoading)                                               return '#8b5cf6'; // purple
    if (!isLoading && query.length >= 2 && songs.length === 0)  return '#f43f5e'; // red
    return '#22c55e';                                                              // green (default)
  }, [isLoading, query, songs.length]);

  // ── Feature: "/" keyboard shortcut ────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toUpperCase?.() ?? '';
      const isEditable =
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        e.target?.isContentEditable;

      if (e.key === '/' && !isEditable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        const input = document.querySelector('input[type="search"]');
        if (input) input.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Feature: play all ─────────────────────────────────────────────────────
  const handlePlayAll = useCallback(() => {
    if (!sortedSongs.length) return;
    setPlaybackContext('dynamic', sortedSongs);
    setQueueFromContext(sortedSongs);
    playSong(sortedSongs[0], sortedSongs);
  }, [sortedSongs, setPlaybackContext, setQueueFromContext, playSong]);

  // ── Artist fallback search (for songs without artistId) ───────────────────
  const handleArtistFallbackSearch = useCallback((artistName) => {
    setSearchParams({ q: artistName });
  }, [setSearchParams]);

  // ── Derived display state ──────────────────────────────────────────────────
  const hasQuery    = query.length >= 2;
  const showBrowse  = !hasQuery;
  const showResults = hasQuery && !isLoading && !isError;
  const hasResults  = showResults && sortedSongs.length > 0;
  const noResults   = showResults && sortedSongs.length === 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{SEARCH_STYLES}</style>

      {/* Sentinel for sticky detection */}
      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

      <div className="sp-page">

        {/* ── Hero ──────────────────────────────────────────────────────────── */}
        <div className={['sp-hero', isSticky ? 'sp-hero--sticky' : ''].join(' ')}>
          <div className="sp-hero__inner">
            {showBrowse && (
              <p className="sp-hero__eyebrow">What do you want to listen to?</p>
            )}

            <div className="sp-hero__bar" style={{ '--mood-color': moodColor }}>
              <SearchBar />
            </div>

            {showBrowse && (
              <p className="sp-hero__hint">
                Press <kbd className="sp-kbd">/</kbd> to focus search
              </p>
            )}
          </div>
        </div>

        {/* ── Body ──────────────────────────────────────────────────────────── */}
        <div className="sp-body">

          {/* ── Recent searches ─────────────────────────────────────────────── */}
          {showBrowse && history.length > 0 && (
            <section className="sp-history">
              <div className="sp-history__header">
                <p className="sp-history__title">Recent searches</p>
                <button className="sp-history__clear" onClick={handleClearHistory}>
                  Clear all
                </button>
              </div>
              <div className="sp-history__pills">
                {history.map((entry) => (
                  <div key={entry} className="sp-history__pill">
                    <button
                      className="sp-history__pill-text"
                      onClick={() => handleHistoryClick(entry)}
                    >
                      {entry}
                    </button>
                    <button
                      className="sp-history__pill-del"
                      onClick={(e) => handleHistoryDelete(e, entry)}
                      aria-label={`Remove "${entry}" from history`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ── Error ───────────────────────────────────────────────────────── */}
          {isError && (
            <div className="sp-error">
              <span className="sp-error__icon">⚠</span>
              <p className="sp-error__title">Search failed</p>
              <p className="sp-error__sub">Something went wrong. Please try again.</p>
            </div>
          )}

          {/* ── Skeleton shimmer ────────────────────────────────────────────── */}
          {isLoading && (
            <div className="sp-skeletons">
              {Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} />
              ))}
            </div>
          )}

          {/* ── Results ─────────────────────────────────────────────────────── */}
          {hasResults && (
            <section className="sp-results">
              <div className="sp-results__header">
                <div className="sp-results__meta">
                  <p className="sp-results__label">
                    Results for{' '}
                    <button
                      className="sp-results__query-btn"
                      onClick={() => setSearchParams({})}
                      title="Clear search"
                    >
                      "{query}"
                    </button>
                  </p>
                  <span className="sp-results__count">
                    {sortedSongs.length} {sortedSongs.length === 1 ? 'song' : 'songs'}
                  </span>
                </div>

                <div className="sp-results__controls">
                  <div className="sp-sort">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        className={['sp-sort__btn', sortKey === opt.key ? 'sp-sort__btn--active' : ''].join(' ')}
                        onClick={() => setSortKey(opt.key)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <button className="sp-play-all" onClick={handlePlayAll} title="Play all results">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 5 }}>
                      <path d="M8 5.14v14l11-7-11-7z" />
                    </svg>
                    Play all
                  </button>
                </div>
              </div>

              <div className="sp-results__list">
                {sortedSongs.map((song, index) => (
                  <SongCard
                    key={song.id}
                    song={song}
                    songList={sortedSongs}
                    index={index}
                    searchQuery={query}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── No results + fuzzy suggestions ──────────────────────────────── */}
          {noResults && (
            <div className="sp-empty">
              <div className="sp-empty__icon">♪</div>
              <p className="sp-empty__title">No results for "{query}"</p>
              <p className="sp-empty__sub">
                Try a different search term or browse an artist below
              </p>

              {fuzzySuggestions.length > 0 && (
                <div className="sp-fuzzy">
                  <p className="sp-fuzzy__label">Did you mean?</p>
                  <div className="sp-fuzzy__pills">
                    {fuzzySuggestions.map((song) => (
                      <button
                        key={song.id}
                        className="sp-fuzzy__pill"
                        onClick={() => setSearchParams({ q: song.title })}
                      >
                        {song.title}
                        {song.artist && (
                          <span className="sp-fuzzy__pill-artist"> — {song.artist}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Browse artists ───────────────────────────────────────────────── */}
          {/* Shown on idle (no query) and on no-results state */}
          {(showBrowse || noResults) && (
            <section className="sp-browse">
              <p className="sp-browse__title">
                {showBrowse ? 'Browse artists' : 'Try browsing artists instead'}
              </p>

              {/* Loading state: library songs not yet fetched */}
              {!librarySongs.length && (
                <div className="sp-browse__grid">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="sp-tile sp-tile--skeleton">
                      <div className="sp-tile__avatar sp-shimmer" />
                      <div className="sp-tile__label-skeleton sp-shimmer" />
                    </div>
                  ))}
                </div>
              )}

              {/* Real artist tiles */}
              {browseArtists.length > 0 && (
                <div className="sp-browse__grid">
                  {browseArtists.map((artist, i) => (
                    <ArtistBrowseCard
                      key={artist.id || artist.name}
                      artist={artist}
                      index={i}
                      onFallbackSearch={handleArtistFallbackSearch}
                    />
                  ))}
                </div>
              )}

              {/* Edge case: library loaded but no artists could be extracted */}
              {librarySongs.length > 0 && browseArtists.length === 0 && (
                <p className="sp-browse__empty">No artists found in your library yet.</p>
              )}
            </section>
          )}

        </div>
      </div>
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const SEARCH_STYLES = `
  .sp-page {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  /* ── Hero ─────────────────────────────────────────────────────────────── */
  .sp-hero {
    padding: 48px 24px 36px;
    background: linear-gradient(180deg, #161616 0%, transparent 100%);
    transition: box-shadow 0.2s ease;
  }

  .sp-hero--sticky {
    position: sticky;
    top: 0;
    z-index: 40;
    background: #0d0d0d;
    box-shadow: 0 2px 16px rgba(0,0,0,0.6);
    padding-top: 16px;
    padding-bottom: 16px;
  }

  .sp-hero__inner {
    max-width: 640px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
  }

  .sp-hero__eyebrow {
    color: #6b7280;
    font-size: 14px;
    font-weight: 500;
    margin: 0;
    text-align: center;
  }

  .sp-hero__bar {
    width: 100%;
    --mood-color: #22c55e;
  }

  .sp-hero__bar [role="combobox"] > div:first-child,
  .sp-hero__bar > div {
    max-width: 100% !important;
    width: 100% !important;
  }

  .sp-hero__bar {
    --sb-border: var(--mood-color, #22c55e);
    transition: --sb-border 0.3s ease;
  }

  .sp-hero__hint {
    color: #374151;
    font-size: 12px;
    margin: 0;
    text-align: center;
  }

  .sp-kbd {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #1f1f1f;
    border: 1px solid #333;
    border-radius: 4px;
    padding: 1px 6px;
    font-size: 11px;
    font-family: monospace;
    color: #9ca3af;
  }

  /* ── Body ─────────────────────────────────────────────────────────────── */
  .sp-body {
    flex: 1;
    padding: 0 24px 48px;
    max-width: 1100px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
  }

  /* ── Recent searches ──────────────────────────────────────────────────── */
  .sp-history { margin-bottom: 24px; }

  .sp-history__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .sp-history__title {
    color: #9ca3af;
    font-size: 13px;
    font-weight: 500;
    margin: 0;
  }

  .sp-history__clear {
    background: none;
    border: none;
    color: #4b5563;
    font-size: 12px;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s;
  }
  .sp-history__clear:hover { color: #9ca3af; }

  .sp-history__pills { display: flex; flex-wrap: wrap; gap: 8px; }

  .sp-history__pill {
    display: flex;
    align-items: center;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 20px;
    overflow: hidden;
  }

  .sp-history__pill-text {
    background: none;
    border: none;
    color: #d1d5db;
    font-size: 13px;
    padding: 5px 10px 5px 12px;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s;
  }
  .sp-history__pill-text:hover { color: #fff; }

  .sp-history__pill-del {
    background: none;
    border: none;
    border-left: 1px solid #2a2a2a;
    color: #4b5563;
    font-size: 14px;
    padding: 5px 8px;
    cursor: pointer;
    line-height: 1;
    transition: color 0.15s;
  }
  .sp-history__pill-del:hover { color: #9ca3af; }

  /* ── Skeleton shimmer ─────────────────────────────────────────────────── */
  .sp-skeletons { padding: 8px 0; }

  .sp-skeleton {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 4px;
  }

  .sp-skeleton__cover { width: 48px; height: 48px; border-radius: 6px; flex-shrink: 0; }
  .sp-skeleton__lines { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .sp-skeleton__line  { border-radius: 4px; height: 12px; }
  .sp-skeleton__line--title  { width: 45%; }
  .sp-skeleton__line--artist { width: 28%; }

  @keyframes sp-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position:  400px 0; }
  }

  .sp-shimmer {
    background: linear-gradient(90deg, #1a1a1a 25%, #252525 50%, #1a1a1a 75%);
    background-size: 800px 100%;
    animation: sp-shimmer 1.4s ease-in-out infinite;
  }

  /* ── Error ────────────────────────────────────────────────────────────── */
  .sp-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 64px 20px;
    text-align: center;
  }
  .sp-error__icon  { font-size: 28px; margin-bottom: 4px; opacity: 0.6; }
  .sp-error__title { color: #f87171; font-size: 16px; font-weight: 600; margin: 0; }
  .sp-error__sub   { color: #6b7280; font-size: 13px; margin: 0; }

  /* ── Results ──────────────────────────────────────────────────────────── */
  .sp-results__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .sp-results__meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .sp-results__label { color: #9ca3af; font-size: 14px; margin: 0; }

  .sp-results__query-btn {
    background: none;
    border: none;
    color: #fff;
    font-weight: 600;
    font-size: 14px;
    font-family: inherit;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: #374151;
    transition: text-decoration-color 0.15s;
  }
  .sp-results__query-btn:hover { text-decoration-color: #6b7280; }

  .sp-results__count {
    color: #6b7280;
    font-size: 12px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 20px;
    padding: 3px 12px;
    white-space: nowrap;
  }

  .sp-results__controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  /* ── Sort toggle ──────────────────────────────────────────────────────── */
  .sp-sort {
    display: flex;
    align-items: center;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 8px;
    overflow: hidden;
  }

  .sp-sort__btn {
    background: none;
    border: none;
    border-right: 1px solid #2a2a2a;
    color: #6b7280;
    font-size: 12px;
    padding: 5px 12px;
    cursor: pointer;
    font-family: inherit;
    transition: color 0.15s, background 0.15s;
    white-space: nowrap;
  }
  .sp-sort__btn:last-child { border-right: none; }
  .sp-sort__btn:hover      { color: #d1d5db; background: rgba(255,255,255,0.04); }
  .sp-sort__btn--active    { color: #22c55e; background: rgba(34,197,94,0.08); }

  /* ── Play all ─────────────────────────────────────────────────────────── */
  .sp-play-all {
    display: flex;
    align-items: center;
    background: #22c55e;
    border: none;
    border-radius: 8px;
    color: #000;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s, transform 0.1s;
    white-space: nowrap;
  }
  .sp-play-all:hover  { background: #16a34a; }
  .sp-play-all:active { transform: scale(0.97); }

  .sp-results__list {
    background: #111;
    border: 1px solid #1e1e1e;
    border-radius: 12px;
    overflow: hidden;
  }

  /* ── Empty state ──────────────────────────────────────────────────────── */
  .sp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 56px 20px 36px;
    text-align: center;
  }

  .sp-empty__icon {
    width: 64px;
    height: 64px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 26px;
    margin-bottom: 4px;
  }

  .sp-empty__title { color: #fff; font-size: 17px; font-weight: 600; margin: 0; }
  .sp-empty__sub   { color: #6b7280; font-size: 13px; max-width: 280px; margin: 0; line-height: 1.5; }

  /* ── Fuzzy suggestions ────────────────────────────────────────────────── */
  .sp-fuzzy {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .sp-fuzzy__label { color: #6b7280; font-size: 13px; margin: 0; }

  .sp-fuzzy__pills {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: center;
  }

  .sp-fuzzy__pill {
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 20px;
    color: #d1d5db;
    font-size: 13px;
    padding: 6px 16px;
    cursor: pointer;
    font-family: inherit;
    transition: border-color 0.15s, color 0.15s;
  }
  .sp-fuzzy__pill:hover { border-color: #22c55e; color: #22c55e; }

  .sp-fuzzy__pill-artist { color: #4b5563; font-size: 12px; }

  /* ── Browse section ───────────────────────────────────────────────────── */
  .sp-browse { margin-top: 8px; }

  .sp-browse__title {
    color: #fff;
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.3px;
    margin: 0 0 14px;
  }

  .sp-browse__empty {
    color: #4b5563;
    font-size: 13px;
    margin: 0;
  }

  .sp-browse__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  /* ── Artist tile ──────────────────────────────────────────────────────── */
  .sp-tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 6px;
    padding: 14px;
    height: 104px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    cursor: pointer;
    overflow: hidden;
    background: var(--tile-bg, rgba(255,255,255,0.04));
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    font-family: inherit;
    text-align: left;
  }

  .sp-tile::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(135deg, var(--tile-accent, #fff) 0%, transparent 80%);
    opacity: 0.10;
    transition: opacity 0.15s ease;
    pointer-events: none;
  }

  .sp-tile:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    border-color: rgba(255,255,255,0.12);
  }
  .sp-tile:hover::before { opacity: 0.18; }
  .sp-tile:active { transform: translateY(0); box-shadow: none; }

  /* Skeleton tile variant */
  .sp-tile--skeleton {
    pointer-events: none;
    gap: 8px;
    justify-content: center;
  }

  /* ── Avatar ───────────────────────────────────────────────────────────── */
  .sp-tile__avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    overflow: hidden;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
  }

  .sp-tile__avatar-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 50%;
  }

  .sp-tile__avatar-initials {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: 700;
    color: #fff;
  }

  /* Skeleton avatar */
  .sp-tile--skeleton .sp-tile__avatar {
    border-radius: 50%;
  }

  /* ── Label ────────────────────────────────────────────────────────────── */
  .sp-tile__label {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.1px;
    position: relative;
    z-index: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .sp-tile__label-skeleton {
    height: 10px;
    width: 60%;
    border-radius: 4px;
  }

  /* ── Badge (→ or 🔍) ──────────────────────────────────────────────────── */
  .sp-tile__badge {
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 11px;
    color: rgba(255,255,255,0.3);
    z-index: 1;
    transition: color 0.15s;
  }
  .sp-tile:hover .sp-tile__badge { color: rgba(255,255,255,0.7); }

  /* ── Responsive ───────────────────────────────────────────────────────── */
  @media (max-width: 479px) {
    .sp-hero  { padding: 28px 16px 20px; }
    .sp-body  { padding: 0 16px 40px; }
    .sp-browse__grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
    .sp-tile  { height: 88px; padding: 10px; }
    .sp-results__controls { width: 100%; justify-content: space-between; }
  }

  @media (min-width: 480px) {
    .sp-browse__grid { grid-template-columns: repeat(3, 1fr); }
  }

  @media (min-width: 768px) {
    .sp-browse__grid { grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .sp-tile { height: 104px; }
  }

  @media (min-width: 1024px) {
    .sp-browse__grid { grid-template-columns: repeat(6, 1fr); }
  }
`;

export default Search;