/**
 * client/src/hooks/useSongs.js
 *
 * Task 2.4 — Hook Return Contract Standardization
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   + isError         — boolean (was missing; callers had `error` but no boolean gate)
 *   + useErrorHandler — auto-watches isError and toasts user-safe message
 *
 * UNCHANGED (CRITICAL — do not touch):
 *   - staleTime (2min) and gcTime (10min) — these fixed the request storm (CLAUDE.md §14)
 *   - useInfiniteQuery with cursor pagination — untouched
 *   - queryKey, queryFn, getNextPageParam, initialPageParam — untouched
 *   - songs flatMap across pages — untouched
 *   - fetchNextPage, hasNextPage, isFetchingNextPage — untouched
 *   - refetch — untouched
 *
 * RETURN SHAPE (now fully standard):
 *   {
 *     songs:              Song[],
 *     data:               InfiniteData | undefined,
 *     isLoading:          boolean,
 *     isError:            boolean,   ← NEW
 *     error:              Error | null,
 *     refetch:            () => void,
 *     fetchNextPage:      () => void,
 *     hasNextPage:        boolean,
 *     isFetchingNextPage: boolean,
 *   }
 *
 * @module useSongs
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getSongs } from '../services/songs.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useErrorHandler } from './useErrorHandler';

/**
 * @param {number} [limit=30]  songs per page
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
export const useSongs = (limit = 30) => {
  const query = useInfiniteQuery({
    queryKey:         [QUERY_KEYS.SONGS],
    queryFn:          ({ pageParam }) => getSongs(limit, pageParam),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    initialPageParam: null,

    // ── Cache policy ───────────────────────────────────────────────────────
    // Songs are admin-managed — they change only via admin upload/delete.
    // 2min staleTime suppresses window-focus refetches that caused the
    // 500/429 request storm. gcTime keeps pages in memory across navigations.
    // DO NOT reduce these values without understanding the storm risk.
    staleTime: 2 * 60_000,   // 2 minutes
    gcTime:    10 * 60_000,  // 10 minutes in-memory cache
  });

  // Auto-toast on songs load failure
  useErrorHandler({
    error:   query.error,
    isError: query.isError,
    context: 'loading songs',
  });

  // Flatten paginated pages into a single array — safe with defensive default
  const songs = query.data?.pages.flatMap((p) => p.songs) ?? [];

  return {
    // ── Data ─────────────────────────────────────────────────────────────────
    songs,
    data:               query.data,

    // ── Standard contract ─────────────────────────────────────────────────────
    isLoading:          query.isLoading,
    isError:            query.isError,      // ← NEW
    error:              query.error ?? null,
    refetch:            query.refetch,

    // ── Infinite query pagination ─────────────────────────────────────────────
    fetchNextPage:      query.fetchNextPage,
    hasNextPage:        query.hasNextPage   ?? false,
    isFetchingNextPage: query.isFetchingNextPage,
  };
};