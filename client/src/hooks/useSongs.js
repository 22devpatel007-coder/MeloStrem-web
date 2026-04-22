/**
 * client/src/hooks/useSongs.js
 *
 * CHANGES IN THIS VERSION (surgical — only these changes):
 *
 *   1. ADDED: getViewportLimit() helper.
 *      WHY:   Hardcoded limit=30 fetches 30 songs regardless of screen size.
 *             A phone showing 8 rows fetches 22 songs that are never visible.
 *             A tall desktop monitor may need 25+ songs on first load.
 *             getViewportLimit() calculates how many rows fit in the current
 *             viewport and adds a small buffer (5 rows) so the user never
 *             sees blank space below the fold.
 *             Clamped to min 10 / max 50 (server hard cap).
 *
 *   2. CHANGED: useSongs(limit) default argument.
 *      OLD:   useSongs(limit = 30)
 *      NEW:   useSongs(limit = getViewportLimit())
 *             Callers that pass an explicit limit are unaffected.
 *             Home.jsx calls useSongs() with no argument — it now gets the
 *             viewport-aware value automatically.
 *
 * UNCHANGED (CRITICAL — do not touch):
 *   - staleTime (2min) and gcTime (10min)
 *   - useInfiniteQuery with cursor pagination
 *   - queryKey, queryFn, getNextPageParam, initialPageParam
 *   - songs flatMap across pages
 *   - fetchNextPage, hasNextPage, isFetchingNextPage
 *   - isError, error, refetch
 *   - useErrorHandler
 *
 * @module useSongs
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getSongs } from '../services/songs.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useErrorHandler } from './useErrorHandler';

// ── Viewport-aware initial page size ──────────────────────────────────────────
//
// Calculates how many song rows fit in the current viewport height and adds a
// small buffer so the user never sees a blank gap below the last row.
//
// SONG_ROW_HEIGHT must match SONG_ROW_HEIGHT in SongList.jsx (61px).
// VIEWPORT_BUFFER is extra rows fetched beyond what's visible — gives the
// virtualizer enough rows to fill overscan without a second fetch.
//
// Called once at hook init (not on every render) because:
//   - window.innerHeight is stable at page load
//   - The result feeds the queryKey and queryFn — changing it mid-session
//     would create a new cache entry and re-fetch, which is wasteful
//   - On resize, React Query's staleTime prevents unnecessary refetches anyway
//
const SONG_ROW_HEIGHT  = 61;
const VIEWPORT_BUFFER  = 5;
const MIN_LIMIT        = 10;
const MAX_LIMIT        = 50; // server hard cap

function getViewportLimit() {
  if (typeof window === 'undefined') return 20; // SSR / test environment fallback
  const viewportRows = Math.ceil(window.innerHeight / SONG_ROW_HEIGHT);
  const withBuffer   = viewportRows + VIEWPORT_BUFFER;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, withBuffer));
}

// ── useSongs ──────────────────────────────────────────────────────────────────

/**
 * @param {number} [limit]  songs per page — defaults to viewport-aware value
 *
 * @returns {{
 *   songs:              import('../types/song').Song[],
 *   data:               object | undefined,
 *   isLoading:          boolean,
 *   isError:            boolean,
 *   error:              Error | null,
 *   refetch:            () => void,
 *   fetchNextPage:      () => void,
 *   hasNextPage:        boolean,
 *   isFetchingNextPage: boolean,
 * }}
 */
export const useSongs = (limit = getViewportLimit()) => {
  const query = useInfiniteQuery({
    queryKey:         [QUERY_KEYS.SONGS],
    queryFn:          ({ pageParam }) => getSongs(limit, pageParam),
    getNextPageParam: (lastPage) => {
      if (lastPage == null || typeof lastPage !== 'object' || Array.isArray(lastPage)) return undefined;
      return (lastPage.hasMore && lastPage.nextCursor != null) ? lastPage.nextCursor : undefined;
    },
    initialPageParam: null,

    // ── Cache policy ───────────────────────────────────────────────────────
    // DO NOT reduce these values — they prevent the request storm documented
    // in CLAUDE.md §14.
    staleTime: 2 * 60_000,   // 2 minutes
    gcTime:    10 * 60_000,  // 10 minutes in-memory cache
  });

  useErrorHandler({
    error:   query.error,
    isError: query.isError,
    context: 'loading songs',
  });

  const songs = query.data?.pages.flatMap((p) => Array.isArray(p?.songs) ? p.songs : []) ?? [];

  return {
    songs,
    data:               query.data,
    isLoading:          query.isLoading,
    isError:            query.isError,
    error:              query.error ?? null,
    refetch:            query.refetch,
    fetchNextPage:      query.fetchNextPage,
    hasNextPage:        query.hasNextPage   ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
};