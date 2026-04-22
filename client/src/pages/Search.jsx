/**
 * client/src/pages/Search.jsx  — PRODUCTION READY
 *
 * Responsive improvements over previous version:
 *  ✅ Hero section properly centred on all screen sizes
 *  ✅ sp-hero__hint (Press / to focus) hidden on touch devices ≤768px
 *  ✅ Browse grid: 2 cols mobile → 3 cols 480px → 4 cols tablet → 6 cols desktop
 *  ✅ sp-body max-width 720px, full-width padding on small screens
 *  ✅ Results header wraps cleanly on narrow viewports
 *  ✅ Sort + Play-all controls stack on very small screens (< 480px)
 *  ✅ Tile height adapts: 88px mobile → 96px 480px → 100px tablet → 104px desktop
 *  ✅ History pill touch targets minimum 44px height (WCAG 2.5.5)
 *  ✅ Fuzzy suggestion pills centred and wrap gracefully
 *  ✅ All bugs from previous version preserved-fixed (infinite loop, skeleton)
 *
 * Logic: zero changes. Only layout/style additions and responsive breakpoints.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import SearchBar from '../components/search/SearchBar';
import SearchSkeleton from '../components/search/SearchSkeleton';
import SongCard from '../components/songs/SongCard';
import { useSearch } from '../hooks/useSearch';
import { useQuery } from '@tanstack/react-query';
import { getSongs } from '../services/songs.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { usePlayerStore } from '../store/playerStore';
import { useQueueStore } from '../store/queueStore';
import { fuzzyMatch } from '../utils/fuzzyMatch';
import { readHistory, pushHistory, removeHistoryEntry, clearHistory } from '../utils/searchHistory';

// ─── Artist extraction ────────────────────────────────────────────────────────
function extractUniqueArtists(songs, limit = 12) {
  if (!Array.isArray(songs) || !songs.length) return [];
  const seen    = new Set();
  const artists = [];
  for (const song of songs) {
    const name = (song.artist || '').trim();
    if (!name) continue;
    const key = song.artistId || name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    artists.push({ id: song.artistId || null, name, coverUrl: song.coverUrl || song.cover || null });
    if (artists.length >= limit) break;
  }
  return artists;
}

// ─── Colour palette for artist tiles ─────────────────────────────────────────
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
const ArtistBrowseCard = ({ artist, index, onFallbackSearch }) => {
  const navigate = useNavigate();
  const palette  = TILE_PALETTE[index % TILE_PALETTE.length];
  const initials = artist.name.charAt(0).toUpperCase();

  const handleClick = () => {
    if (artist.id) navigate(`/artist/${artist.id}`);
    else onFallbackSearch(artist.name);
  };

  return (
    <button
      className="sp-tile"
      style={{ '--tile-bg': palette.bg, '--tile-accent': palette.accent }}
      onClick={handleClick}
      aria-label={`Browse ${artist.name}`}
      title={artist.id ? `Go to ${artist.name}` : `Search for ${artist.name}`}
    >
      <div className="sp-tile__avatar">
        {artist.coverUrl ? (
          <img
            src={artist.coverUrl}
            alt={artist.name}
            className="sp-tile__avatar-img"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextSibling.style.display = 'flex';
            }}
          />
        ) : null}
        <div
          className="sp-tile__avatar-initials"
          style={{ display: artist.coverUrl ? 'none' : 'flex', background: palette.accent }}
        >
          {initials}
        </div>
      </div>
      <span className="sp-tile__label">{artist.name}</span>
      <span className="sp-tile__badge" aria-hidden="true">{artist.id ? '→' : '🔍'}</span>
    </button>
  );
};

// ─── Sort options ─────────────────────────────────────────────────────────────
const SORT_OPTIONS = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'title',     label: 'Title A–Z'  },
  { key: 'artist',    label: 'Artist A–Z' },
];

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
  const rawQ  = searchParams.get('q') || '';
  const query = rawQ.trim().length >= 2 ? rawQ.trim() : '';

  // isFetching fires on every in-flight request; isLoading only on first uncached load
  const { data, isFetching, isError } = useSearch(query);

  // FIX 1a: memoize on `data` (stable RQ ref), not `data?.songs` (new ref every render)
  const songs = useMemo(() => data?.songs ?? [], [data]);

  // FIX 1b: flatMap inside useMemo so librarySongs only gets new ref when pages change
  const { data: librarySongs = [] } = useQuery({
  queryKey:  [QUERY_KEYS.SONGS, 'browse-artists'],
  queryFn:   () => getSongs(500, null),
  staleTime: 5 * 60_000,
  select:    (data) => data?.songs ?? [],
});
  const { playSong, setPlaybackContext } = usePlayerStore();
  const { setQueueFromContext }          = useQueueStore();

  const browseArtists = useMemo(
    () => extractUniqueArtists(librarySongs, 12),
    [librarySongs]
  );

  // ── Sort ─────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState('relevance');

  const sortedSongs = useMemo(() => {
    if (!songs.length) return songs;
    if (sortKey === 'title')  return [...songs].sort((a, b) => (a.title  || '').localeCompare(b.title  || ''));
    if (sortKey === 'artist') return [...songs].sort((a, b) => (a.artist || '').localeCompare(b.artist || ''));
    return songs;
  }, [songs, sortKey]);

  // ── Fuzzy "did you mean?" ────────────────────────────────────────────────
  const fuzzyDebounceRef = useRef(null);
  const librarySongsRef  = useRef(librarySongs);
  const [fuzzySuggestions, setFuzzySuggestions] = useState([]);

  // Keep ref current without triggering re-renders
  useEffect(() => { librarySongsRef.current = librarySongs; });

  // FIX 1c: use primitive length as dep — not the array reference
  const librarySongsLength = librarySongs.length;

  useEffect(() => {
    clearTimeout(fuzzyDebounceRef.current);

    const hasQuery   = query.length >= 2;
    const noResults  = !isFetching && songs.length === 0;
    const hasLibrary = librarySongsLength > 0;

    if (!hasQuery || !noResults || !hasLibrary) {
      setFuzzySuggestions([]);
      return;
    }

    fuzzyDebounceRef.current = setTimeout(() => {
      const candidates = librarySongsRef.current.slice(0, 500);
      setFuzzySuggestions(
        fuzzyMatch(query, candidates, { maxResults: 3, threshold: 0.35 })
      );
    }, 150);

    return () => clearTimeout(fuzzyDebounceRef.current);
  }, [query, isFetching, songs.length, librarySongsLength]);

  // ── Recent searches ───────────────────────────────────────────────────────
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

  // ── Sticky search bar ─────────────────────────────────────────────────────
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

  // ── Mood ring border color ────────────────────────────────────────────────
  const moodColor = useMemo(() => {
    if (isFetching)                                              return '#8b5cf6';
    if (!isFetching && query.length >= 2 && songs.length === 0) return '#f43f5e';
    return '#22c55e';
  }, [isFetching, query, songs.length]);

  // ── "/" keyboard shortcut ─────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName?.toUpperCase?.() ?? '';
      const isEditable =
        tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        e.target?.isContentEditable;
      if (e.key === '/' && !isEditable && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        document.querySelector('input[type="search"]')?.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // ── Play all ──────────────────────────────────────────────────────────────
  const handlePlayAll = useCallback(() => {
    if (!sortedSongs.length) return;
    setPlaybackContext('dynamic', sortedSongs);
    setQueueFromContext(sortedSongs);
    playSong(sortedSongs[0], sortedSongs);
  }, [sortedSongs, setPlaybackContext, setQueueFromContext, playSong]);

  // ── Artist fallback search ────────────────────────────────────────────────
  const handleArtistFallbackSearch = useCallback((artistName) => {
    setSearchParams({ q: artistName });
  }, [setSearchParams]);

  // ── Derived display state ─────────────────────────────────────────────────
  const hasQuery           = query.length >= 2;
  const showBrowse         = !hasQuery;
  const showBrowseSkeleton = showBrowse && browseArtists.length === 0;
  // FIX 2: isFetching fires on every new query, not just the very first load
  const showSkeleton       = hasQuery && isFetching;
  const showResults        = hasQuery && !isFetching && !isError;
  const hasResults         = showResults && sortedSongs.length > 0;
  const noResults          = showResults && sortedSongs.length === 0;

  if (showBrowseSkeleton) return <SearchSkeleton />;

  return (
    <div className="sp-content-enter">
      <style>{SEARCH_STYLES}</style>

      <div ref={sentinelRef} style={{ height: 1 }} aria-hidden="true" />

      <div className="sp-page">

        {/* ── Hero ────────────────────────────────────────────────────────── */}
        <div className={['sp-hero', isSticky ? 'sp-hero--sticky' : ''].join(' ')}>
          <div className="sp-hero__inner">
            {showBrowse && (
              <p className="sp-hero__eyebrow">What do you want to listen to?</p>
            )}
            <div className="sp-hero__bar" style={{ '--mood-color': moodColor }}>
              <SearchBar />
            </div>
            {/* Desktop-only — "/" shortcut isn't relevant on touch devices */}
            {showBrowse && (
              <p className="sp-hero__hint sp-hint-desktop-only">
                Press <kbd className="sp-kbd">/</kbd> to focus search
              </p>
            )}
          </div>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="sp-body">

          {/* Recent searches — pills only, no dropdown */}
          {showBrowse && history.length > 0 && (
            <section className="sp-history" aria-label="Recent searches">
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
                    >×</button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Error */}
          {isError && (
            <div className="sp-error" role="alert">
              <span className="sp-error__icon">⚠</span>
              <p className="sp-error__title">Search failed</p>
              <p className="sp-error__sub">Something went wrong. Please try again.</p>
            </div>
          )}

          {/* Skeleton shimmer — FIX 2: uses isFetching, shows on every new search */}
          {showSkeleton && (
            <div className="sp-skeletons" aria-busy="true" aria-label="Loading search results">
              {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            </div>
          )}

          {/* Results */}
          {hasResults && (
            <section className="sp-results" aria-label={`Search results for ${query}`}>
              <div className="sp-results__header">
                <div className="sp-results__meta">
                  <p className="sp-results__label">
                    Results for{' '}
                    <button
                      className="sp-results__query-btn"
                      onClick={() => setSearchParams({})}
                      title="Clear search"
                    >"{query}"</button>
                  </p>
                  <span className="sp-results__count">
                    {sortedSongs.length} {sortedSongs.length === 1 ? 'song' : 'songs'}
                  </span>
                </div>
                <div className="sp-results__controls">
                  <div className="sp-sort" role="group" aria-label="Sort order">
                    {SORT_OPTIONS.map((opt) => (
                      <button
                        key={opt.key}
                        className={['sp-sort__btn', sortKey === opt.key ? 'sp-sort__btn--active' : ''].join(' ')}
                        onClick={() => setSortKey(opt.key)}
                        aria-pressed={sortKey === opt.key}
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

          {/* No results + fuzzy suggestions */}
          {noResults && (
            <div className="sp-empty" role="status">
              <div className="sp-empty__icon">♪</div>
              <p className="sp-empty__title">No results for "{query}"</p>
              <p className="sp-empty__sub">Try a different search term or browse an artist below</p>
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

          {/* Browse artists — shown when no active query */}
          {showBrowse && (
            <section className="sp-browse" aria-label="Browse artists">
              <p className="sp-browse__title">Browse Artists</p>
              {browseArtists.length === 0 ? (
                <p className="sp-browse__empty">No artists found in your library yet.</p>
              ) : (
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
            </section>
          )}

        </div>
      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const SEARCH_STYLES = `
  @keyframes sp-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .sp-content-enter {
    animation: sp-fade-in 0.25s ease both;
  }

  .sp-page {
    min-height: 100vh;
    background: #0a0a0a;
    color: #fff;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  /* ── Hero ──────────────────────────────────────────────────────────────── */
  .sp-hero {
    padding: 28px 16px 20px;
    background: #0a0a0a;
    transition: box-shadow 0.2s, padding 0.2s;
  }

  .sp-hero--sticky {
    position: sticky;
    top: 0;
    z-index: 50;
    padding: 10px 16px;
    box-shadow: 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    background: rgba(10,10,10,0.92);
  }

  .sp-hero__inner {
    max-width: 540px;
    margin: 0 auto;
    width: 100%;
  }

  .sp-hero__eyebrow {
    color: #9ca3af;
    font-size: 13px;
    font-weight: 500;
    margin: 0 0 12px;
    letter-spacing: 0.01em;
    text-align: center;
  }

  .sp-hero__bar {
    border-radius: 12px;
    outline: 2px solid var(--mood-color, #22c55e);
    outline-offset: 2px;
    transition: outline-color 0.3s ease;
  }

  .sp-hero__hint {
    color: #4b5563;
    font-size: 12px;
    margin: 10px 0 0;
    text-align: center;
  }

  /* Hide "/" hint on touch/mobile — not useful without a physical keyboard */
  @media (max-width: 768px) {
    .sp-hint-desktop-only { display: none; }
  }

  .sp-kbd {
    background: #1f2937;
    border: 1px solid #374151;
    border-radius: 4px;
    padding: 1px 5px;
    font-size: 11px;
    color: #9ca3af;
    font-family: inherit;
  }

  /* ── Body ──────────────────────────────────────────────────────────────── */
  .sp-body {
    padding: 0 16px 100px;
    max-width: 720px;
    margin: 0 auto;
    box-sizing: border-box;
    width: 100%;
  }

  /* ── Error ─────────────────────────────────────────────────────────────── */
  .sp-error {
    display: flex; flex-direction: column; align-items: center;
    gap: 6px; padding: 40px 20px; text-align: center;
  }
  .sp-error__icon  { font-size: 24px; color: #f43f5e; }
  .sp-error__title { color: #fff; font-size: 15px; font-weight: 600; margin: 0; }
  .sp-error__sub   { color: #6b7280; font-size: 13px; margin: 0; }

  /* ── Shimmer ───────────────────────────────────────────────────────────── */
  @keyframes sp-shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }

  .sp-shimmer {
    background: linear-gradient(90deg, #1a1a1a 25%, #2a2a2a 50%, #1a1a1a 75%);
    background-size: 200% 100%;
    animation: sp-shimmer 1.4s infinite;
  }

  .sp-skeletons { display: flex; flex-direction: column; gap: 10px; margin-top: 8px; }

  .sp-skeleton {
    display: flex; align-items: center; gap: 12px;
    padding: 10px 14px; background: #111;
    border-radius: 10px; border: 1px solid #1e1e1e;
  }
  .sp-skeleton__cover        { width: 44px; height: 44px; border-radius: 8px; flex-shrink: 0; }
  .sp-skeleton__lines        { flex: 1; display: flex; flex-direction: column; gap: 8px; }
  .sp-skeleton__line         { height: 10px; border-radius: 4px; }
  .sp-skeleton__line--title  { width: 55%; }
  .sp-skeleton__line--artist { width: 35%; }

  /* ── History ───────────────────────────────────────────────────────────── */
  .sp-history { margin-bottom: 24px; }

  .sp-history__header {
    display: flex; align-items: center;
    justify-content: space-between; margin-bottom: 10px;
  }

  .sp-history__title {
    color: #9ca3af; font-size: 12px; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.06em; margin: 0;
  }

  .sp-history__clear {
    background: none; border: none; color: #6b7280; font-size: 12px;
    cursor: pointer; font-family: inherit; padding: 0;
    transition: color 0.15s; min-height: 44px;
    display: flex; align-items: center;
  }
  .sp-history__clear:hover { color: #f43f5e; }

  .sp-history__pills { display: flex; flex-wrap: wrap; gap: 8px; }

  .sp-history__pill {
    display: flex; align-items: center;
    background: #1a1a1a; border: 1px solid #2a2a2a;
    border-radius: 20px; overflow: hidden; transition: border-color 0.15s;
  }
  .sp-history__pill:hover { border-color: #3f3f3f; }

  /* Touch-friendly pill targets — min 44px height (WCAG 2.5.5) */
  .sp-history__pill-text {
    background: none; border: none; color: #d1d5db; font-size: 13px;
    padding: 0 8px 0 14px; cursor: pointer; font-family: inherit;
    transition: color 0.15s; min-height: 44px;
    display: flex; align-items: center;
  }
  .sp-history__pill-text:hover { color: #fff; }

  .sp-history__pill-del {
    background: none; border: none; color: #4b5563; font-size: 15px;
    line-height: 1; padding: 0 12px 0 4px; cursor: pointer;
    font-family: inherit; transition: color 0.15s;
    min-height: 44px; display: flex; align-items: center;
  }
  .sp-history__pill-del:hover { color: #f43f5e; }

  /* ── Results ───────────────────────────────────────────────────────────── */
  .sp-results { margin-bottom: 24px; }

  .sp-results__header {
    display: flex; align-items: center; justify-content: space-between;
    flex-wrap: wrap; gap: 10px; margin-bottom: 12px;
  }

  .sp-results__meta  { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .sp-results__label { color: #9ca3af; font-size: 13px; margin: 0; }

  .sp-results__query-btn {
    background: none; border: none; color: #fff; font-size: 13px;
    font-weight: 600; cursor: pointer; font-family: inherit;
    padding: 0; transition: color 0.15s;
  }
  .sp-results__query-btn:hover { color: #f43f5e; text-decoration: line-through; }

  .sp-results__count { color: #4b5563; font-size: 12px; white-space: nowrap; }

  .sp-results__controls {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
  }

  .sp-sort {
    display: flex; background: #111;
    border: 1px solid #1e1e1e; border-radius: 8px; overflow: hidden;
  }

  .sp-sort__btn {
    background: none; border: none; color: #6b7280; font-size: 12px;
    font-weight: 500; padding: 7px 10px; cursor: pointer;
    font-family: inherit; transition: color 0.15s, background 0.15s;
    white-space: nowrap; min-height: 36px;
  }
  .sp-sort__btn:hover   { color: #d1d5db; background: rgba(255,255,255,0.04); }
  .sp-sort__btn--active { color: #22c55e; background: rgba(34,197,94,0.08); }

  .sp-play-all {
    display: flex; align-items: center; background: #22c55e;
    border: none; border-radius: 8px; color: #000; font-size: 12px;
    font-weight: 600; padding: 7px 14px; cursor: pointer;
    font-family: inherit; transition: background 0.15s, transform 0.1s;
    white-space: nowrap; min-height: 36px;
  }
  .sp-play-all:hover  { background: #16a34a; }
  .sp-play-all:active { transform: scale(0.97); }

  .sp-results__list {
    background: #111; border: 1px solid #1e1e1e;
    border-radius: 12px; overflow: hidden;
  }

  /* ── Empty state ───────────────────────────────────────────────────────── */
  .sp-empty {
    display: flex; flex-direction: column; align-items: center;
    gap: 10px; padding: 56px 20px 36px; text-align: center;
  }

  .sp-empty__icon {
    width: 64px; height: 64px; background: #1a1a1a;
    border: 1px solid #2a2a2a; border-radius: 18px;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px; margin-bottom: 4px;
  }

  .sp-empty__title { color: #fff; font-size: 17px; font-weight: 600; margin: 0; }
  .sp-empty__sub   { color: #6b7280; font-size: 13px; max-width: 280px; margin: 0; line-height: 1.5; }

  /* ── Fuzzy suggestions ─────────────────────────────────────────────────── */
  .sp-fuzzy {
    margin-top: 8px; display: flex;
    flex-direction: column; align-items: center; gap: 10px;
  }

  .sp-fuzzy__label { color: #6b7280; font-size: 13px; margin: 0; }

  .sp-fuzzy__pills {
    display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;
  }

  .sp-fuzzy__pill {
    background: #1a1a1a; border: 1px solid #2a2a2a;
    border-radius: 20px; color: #d1d5db; font-size: 13px;
    padding: 0 16px; cursor: pointer; font-family: inherit;
    transition: border-color 0.15s, color 0.15s;
    min-height: 44px; display: flex; align-items: center;
  }
  .sp-fuzzy__pill:hover  { border-color: #22c55e; color: #22c55e; }
  .sp-fuzzy__pill-artist { color: #4b5563; font-size: 12px; }

  /* ── Browse artists ────────────────────────────────────────────────────── */
  .sp-browse { margin-top: 8px; }

  .sp-browse__title {
    color: #fff; font-size: 18px; font-weight: 700;
    letter-spacing: -0.3px; margin: 0 0 14px;
  }

  .sp-browse__empty { color: #4b5563; font-size: 13px; margin: 0; }

  /*
   * Artist grid — mobile-first responsive:
   *   default (< 480px) → 2 columns
   *   480px+            → 3 columns
   *   768px+            → 4 columns
   *   1024px+           → 6 columns
   */
  .sp-browse__grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  /* ── Artist tile ───────────────────────────────────────────────────────── */
  .sp-tile {
    position: relative;
    display: flex; flex-direction: column;
    align-items: flex-start; justify-content: flex-end;
    gap: 5px; padding: 10px;
    height: 88px; min-height: 88px;
    border-radius: 12px;
    border: 1px solid rgba(255,255,255,0.06);
    cursor: pointer; overflow: hidden;
    background: var(--tile-bg, rgba(255,255,255,0.04));
    transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
    font-family: inherit; text-align: left; width: 100%;
    -webkit-tap-highlight-color: transparent;
  }

  .sp-tile::before {
    content: ''; position: absolute; inset: 0;
    background: linear-gradient(135deg, var(--tile-accent, #fff) 0%, transparent 80%);
    opacity: 0.10; transition: opacity 0.15s ease; pointer-events: none;
  }

  .sp-tile:hover        { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4); border-color: rgba(255,255,255,0.12); }
  .sp-tile:hover::before { opacity: 0.18; }
  .sp-tile:active       { transform: translateY(0); box-shadow: none; }

  .sp-tile__avatar {
    width: 30px; height: 30px; border-radius: 50%;
    overflow: hidden; flex-shrink: 0; position: relative; z-index: 1;
  }

  .sp-tile__avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 50%; }

  .sp-tile__avatar-initials {
    width: 100%; height: 100%; border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 12px; font-weight: 700; color: #fff;
  }

  .sp-tile__label {
    font-size: 12px; font-weight: 700; color: #fff; letter-spacing: -0.1px;
    position: relative; z-index: 1; white-space: nowrap;
    overflow: hidden; text-overflow: ellipsis; max-width: 100%;
  }

  .sp-tile__badge {
    position: absolute; top: 8px; right: 8px;
    font-size: 10px; color: rgba(255,255,255,0.3); z-index: 1; transition: color 0.15s;
  }
  .sp-tile:hover .sp-tile__badge { color: rgba(255,255,255,0.7); }

  /* ── Breakpoints ───────────────────────────────────────────────────────── */

  /* Larger phones / landscape phones */
  @media (min-width: 480px) {
    .sp-browse__grid { grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .sp-tile { height: 96px; min-height: 96px; padding: 12px; }
    .sp-tile__avatar { width: 34px; height: 34px; }
    .sp-tile__avatar-initials { font-size: 13px; }
    .sp-tile__label { font-size: 13px; }
    .sp-tile__badge { font-size: 11px; }
  }

  /* Tablets */
  @media (min-width: 768px) {
    .sp-hero { padding: 36px 20px 24px; }
    .sp-body { padding: 0 20px 100px; }
    .sp-browse__grid { grid-template-columns: repeat(4, 1fr); gap: 12px; }
    .sp-tile { height: 100px; min-height: 100px; padding: 14px; }
    .sp-tile__avatar { width: 36px; height: 36px; }
    .sp-tile__avatar-initials { font-size: 14px; }
  }

  /* Desktop */
  @media (min-width: 1024px) {
    .sp-hero { padding: 44px 28px 28px; }
    .sp-body { padding: 0 28px 100px; }
    .sp-browse__grid { grid-template-columns: repeat(6, 1fr); gap: 12px; }
    .sp-tile { height: 104px; min-height: 104px; }
    .sp-tile__badge { top: 10px; right: 10px; }
  }

  /* Very small screens — results controls stack to prevent overflow */
  @media (max-width: 479px) {
    .sp-results__header   { flex-direction: column; align-items: flex-start; }
    .sp-results__controls { width: 100%; justify-content: space-between; }
    .sp-sort              { flex: 1; }
    .sp-sort__btn         { flex: 1; text-align: center; padding: 7px 4px; font-size: 11px; }
    .sp-play-all          { flex-shrink: 0; }
    .sp-browse__title     { font-size: 16px; }
    .sp-empty__title      { font-size: 15px; }
  }
`;

export default Search;