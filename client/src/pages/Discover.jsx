/**
 * client/src/pages/Discover.jsx
 *
 * Discover page — browse and play Jamendo (Creative Commons) tracks, with
 * offset-based "Load more" pagination (see useJamendoSearch.js for why
 * Jamendo's API requires this pattern instead of a total-count approach).
 *
 * PLAYBACK CONTEXT — IMPORTANT DESIGN DECISION:
 *   Each row renders <SongCard contextType="discover" .../> — NOT the
 *   default 'library'. This is deliberate and required for correctness:
 *
 *   playerStore's pagination bridge (_paginationBridge, registered by
 *   useSongs.js) assumes 'library' context means "the infinite-scrolled
 *   Firestore song collection" — when playNext() reaches the end of the
 *   queue in 'library' context, it calls _paginationBridge.fetchNextPage()
 *   to load more Firestore songs. If Discover reused 'library' as its
 *   context type, skipping to the end of a Jamendo result set would
 *   incorrectly trigger a Firestore pagination fetch and splice unrelated
 *   library songs into the Jamendo queue.
 *
 *   Using 'discover' as a distinct context type means:
 *     - playerStore.playNext() falls through to plain linear playback,
 *       which is exactly the right behavior for a fixed search-result list.
 *     - Classic/smart shuffle both still work normally.
 *     - Nothing in playerStore.js or queueStore.js needed to change.
 *
 * LOADING-STATE NOTE:
 *   The skeleton is keyed off `isLoading` ONLY (first fetch for a brand-new
 *   query/tag combo), never `isFetching`. `isFetching` also goes true
 *   during background refetches AND while a "Load more" page is in flight —
 *   gating the skeleton on it would wipe out and re-mount the entire
 *   already-loaded results list every time the user clicks "Load more".
 *   `isFetchingNextPage` is used instead, scoped to just the Load More
 *   button, so existing results stay mounted while more load.
 *
 * ATTRIBUTION:
 *   Jamendo's Creative Commons licenses require attribution. Each result
 *   row shows the CC attribution line inline (via the license field already
 *   present on the normalized track) so this holds regardless of which
 *   page the track is played from.
 */

import { useState } from 'react';
import { useJamendoSearch } from '../hooks/useJamendoSearch';
import SongCard from '../components/songs/SongCard';

const GENRE_TAGS = [
  { label: 'All',        value: '' },
  { label: 'Acoustic',   value: 'acoustic' },
  { label: 'Electronic', value: 'electronic' },
  { label: 'Rock',       value: 'rock' },
  { label: 'Jazz',       value: 'jazz' },
  { label: 'Ambient',    value: 'ambient' },
  { label: 'Lofi',       value: 'lofi' },
  { label: 'Classical',  value: 'classical' },
  { label: 'Hip Hop',    value: 'hiphop' },
];

const SKELETON_ROW_COUNT = 8;

/** Single shimmer row, shaped like a SongCard: cover + title/artist lines. */
const DiscoverSkeletonRow = ({ index }) => (
  <div className="discover-skeleton-row" aria-hidden="true">
    <div className="discover-skeleton-cover" />
    <div className="discover-skeleton-lines">
      <div className="discover-skeleton-line discover-skeleton-line--title" />
      <div className="discover-skeleton-line discover-skeleton-line--artist" />
    </div>
  </div>
);

const Discover = () => {
  const [activeTag, setActiveTagState] = useState('');

  const {
    query,
    setQuery,
    clearQuery,
    tracks,
    total,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    isBrowseAll,
    reshuffle,
    isError,
    error,
    refetch,
  } = useJamendoSearch({ tags: activeTag });

  // Defensive: never trust an external API response shape blindly.
  // Filters out any null/undefined/id-less entries before they ever reach
  // SongCard, so a malformed Jamendo payload can't crash the page.
  const safeTracks = Array.isArray(tracks) ? tracks.filter((t) => t && t.id) : [];

  // No "type something first" empty state — an empty query with no tag
  // ("All") is a valid browse request; the backend returns a random,
  // client-shuffled page for it (see useJamendoSearch.js). "No results"
  // now only means the request genuinely came back empty after loading.
  const showNoResults = !isLoading && safeTracks.length === 0;

  return (
    <div className="discover-content-enter">
      <style>{DISCOVER_STYLES}</style>

      <div className="discover-topbar">
        <div className="discover-topbar__left">
          <h1 className="discover-topbar__title">Discover</h1>
          <span className="discover-topbar__subtitle">
            Free, Creative Commons music from independent artists — powered by Jamendo
          </span>
        </div>
      </div>

      <div className="discover-body">
        {/* ── Search input ── */}
        <div className="discover-search-wrap">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="discover-search-icon">
            <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for tracks or artists on Jamendo..."
            className="discover-search-input"
            autoComplete="off"
            spellCheck={false}
          />
          {query.length > 0 && (
            <button onClick={clearQuery} className="discover-search-clear" aria-label="Clear search">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Genre tag pills ── */}
        <div className="discover-genres">
          {GENRE_TAGS.map((g) => (
            <button
              key={g.value || 'all'}
              onClick={() => setActiveTagState(g.value)}
              className="discover-genre-pill"
              data-active={activeTag === g.value}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* ── Results ── */}
        {isLoading ? (
          <div className="discover-skeleton-list">
            {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
              <DiscoverSkeletonRow key={i} index={i} />
            ))}
          </div>
        ) : isError ? (
          <div className="discover-error">
            <p className="discover-error__title">Couldn't reach Jamendo</p>
            <p className="discover-error__msg">{error?.message || 'Please try again.'}</p>
            <button onClick={refetch} className="discover-error__retry">Retry</button>
          </div>
        ) : showNoResults ? (
          <div className="discover-prompt">
            <p>No results found. Try a different search term or genre.</p>
          </div>
        ) : (
          <>
            <div className="discover-results-header">
              <p className="discover-results-count">
                {total} track{total === 1 ? '' : 's'} loaded
              </p>
              {isBrowseAll && (
                <button onClick={reshuffle} className="discover-shuffle-btn">
                  Shuffle
                </button>
              )}
            </div>

            <div className="discover-results-list">
              {safeTracks.map((track, idx) => (
                <SongCard
                  key={track.id}
                  song={track}
                  contextSongs={safeTracks}
                  startIndex={idx}
                  contextType="discover"
                />
              ))}
            </div>

            {hasNextPage && (
              <button
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
                className="discover-load-more"
              >
                {isFetchingNextPage ? 'Loading more...' : 'Load more'}
              </button>
            )}

            {safeTracks.some((t) => t?.license?.attributionText) && (
              <p className="discover-attribution-note">
                All tracks are Creative Commons licensed via Jamendo. Artist attribution is shown per track.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const DISCOVER_STYLES = `
  @keyframes discover-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes discover-shimmer {
    0%   { background-position: -400px 0; }
    100% { background-position: 400px 0; }
  }

  .discover-content-enter { animation: discover-fade-in 0.25s ease both; }

  .discover-topbar {
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 24px; min-height: 60px; background: #0f0f0f;
    position: sticky; top: 0; z-index: 20; border-bottom: 1px solid #1e1e1e;
    box-sizing: border-box;
  }
  .discover-topbar__left { display: flex; flex-direction: column; gap: 2px; padding: 12px 0; }
  .discover-topbar__title { font-size: 20px; font-weight: 700; color: #fff; margin: 0; line-height: 1.2; }
  .discover-topbar__subtitle { font-size: 12px; color: #6b7280; }

  .discover-body { padding: 20px 24px 40px; max-width: 100%; box-sizing: border-box; }

  .discover-search-wrap {
    display: flex; align-items: center; gap: 8px;
    background: #1a1a1a; border: 1px solid #2a2a2a; border-radius: 10px;
    padding: 0 14px; height: 44px; max-width: 480px; margin-bottom: 16px;
    box-sizing: border-box; transition: border-color 0.2s;
  }
  .discover-search-wrap:focus-within { border-color: #22c55e; }
  .discover-search-icon { color: #6b7280; flex-shrink: 0; }
  .discover-search-input {
    flex: 1; background: transparent; border: none; outline: none;
    color: #fff; font-size: 14px; font-family: inherit; min-width: 0;
  }
  .discover-search-input::placeholder { color: #4b5563; }
  .discover-search-clear { background: none; border: none; color: #4b5563; cursor: pointer; display: flex; padding: 0; }
  .discover-search-clear:hover { color: #e5e7eb; }

  .discover-genres { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .discover-genre-pill {
    padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 500;
    border: 1px solid #2d2d2d; background: #1a1a1a; color: #9ca3af;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
  }
  .discover-genre-pill:hover { border-color: #444; color: #e5e7eb; }
  .discover-genre-pill[data-active="true"] {
    background: rgba(34,197,94,0.1); border-color: #22c55e; color: #22c55e;
  }

  /* ── Skeleton loading state ── */
  .discover-skeleton-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .discover-skeleton-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 4px;
  }
  .discover-skeleton-cover {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    flex-shrink: 0;
    background: linear-gradient(90deg, #1a1a1a 25%, #232323 37%, #1a1a1a 63%);
    background-size: 800px 100%;
    animation: discover-shimmer 1.4s ease-in-out infinite;
  }
  .discover-skeleton-lines {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }
  .discover-skeleton-line {
    height: 10px;
    border-radius: 4px;
    background: linear-gradient(90deg, #1a1a1a 25%, #232323 37%, #1a1a1a 63%);
    background-size: 800px 100%;
    animation: discover-shimmer 1.4s ease-in-out infinite;
  }
  .discover-skeleton-line--title { width: 45%; }
  .discover-skeleton-line--artist { width: 25%; }

  .discover-error {
    display: flex; flex-direction: column; align-items: center; gap: 8px;
    padding: 60px 20px; text-align: center;
  }
  .discover-error__title { color: #fff; font-size: 15px; font-weight: 600; margin: 0; }
  .discover-error__msg { color: #6b7280; font-size: 13px; margin: 0; }
  .discover-error__retry {
    margin-top: 8px; background: #22c55e; color: #000; font-weight: 600;
    font-size: 13px; padding: 8px 20px; border-radius: 8px; border: none;
    cursor: pointer; transition: background 0.15s;
  }
  .discover-error__retry:hover { background: #4ade80; }

  .discover-prompt {
    padding: 60px 20px; text-align: center; color: #4b5563; font-size: 13px;
  }

  .discover-results-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }
  .discover-results-count { font-size: 12px; color: #6b7280; margin: 0; }
  .discover-shuffle-btn {
    background: none;
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    color: #9ca3af;
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    padding: 5px 14px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .discover-shuffle-btn:hover { border-color: #22c55e; color: #22c55e; }

  .discover-results-list {
    display: flex;
    flex-direction: column;
  }

  .discover-load-more {
    display: block;
    margin: 20px auto 0;
    padding: 10px 28px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    color: #e5e7eb;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
  }
  .discover-load-more:hover:not(:disabled) { border-color: #22c55e; color: #22c55e; }
  .discover-load-more:disabled { opacity: 0.5; cursor: default; }

  .discover-attribution-note {
    font-size: 11px; color: #374151; margin-top: 16px; text-align: center;
  }

  /* ── Responsive ── */
  @media (max-width: 639px) {
    .discover-topbar { padding: 0 16px; }
    .discover-body { padding: 16px 12px 32px; }
    .discover-search-wrap { max-width: 100%; }
  }
`;

export default Discover;