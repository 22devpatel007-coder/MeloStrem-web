/**
 * client/src/hooks/useSongs.js
 *
 * PRODUCTION FIX — Request storm eliminated
 *
 * ROOT CAUSE:
 *   useInfiniteQuery had zero staleTime (React Query default = 0ms).
 *   staleTime:0 means data is IMMEDIATELY stale after every fetch.
 *   React Query's refetchOnWindowFocus fires on every tab switch/window click,
 *   and with staleTime:0 every one of those triggers a new songs?limit=30 request.
 *   With the music player keeping the app alive indefinitely, and users switching
 *   tabs constantly, this created the repeated 500/429 storm visible in DevTools.
 *
 * FIX:
 *   staleTime: 2 minutes  — songs list is fresh for 2 min after any fetch.
 *     refetchOnWindowFocus will not re-fetch within this window.
 *     Songs are admin-managed (rare changes) so 2 min staleness is safe.
 *
 *   gcTime: 10 minutes — pages stay in memory cache for 10 min.
 *     Navigating away and back within 10 min = instant render from cache,
 *     no loading state, no network request.
 *
 *   refetchOnWindowFocus: true (kept, React Query default) — still refetches
 *     after the staleTime window so data doesn't go stale forever on long sessions.
 *
 * WHAT DID NOT CHANGE:
 *   - queryKey, queryFn, getNextPageParam, initialPageParam — untouched
 *   - Return shape — untouched (songs, fetchNextPage, hasNextPage, etc.)
 *   - Infinite scroll behavior — untouched
 */

import { useInfiniteQuery } from '@tanstack/react-query';
import { getSongs } from '../services/songs.service';
import { QUERY_KEYS } from '../constants/queryKeys';

export const useSongs = (limit = 30) => {
  const query = useInfiniteQuery({
    queryKey:        [QUERY_KEYS.SONGS],
    queryFn:         ({ pageParam }) => getSongs(limit, pageParam),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: null,

    // ── Cache policy ──────────────────────────────────────────────────────────
    // Songs are admin-managed content — they change only via admin upload/delete.
    // 2 min staleTime means window-focus refetches are suppressed for 2 min,
    // eliminating the 500/429 storm while keeping data reasonably fresh.
    staleTime: 2 * 60_000,   // 2 minutes
    gcTime:    10 * 60_000,  // 10 minutes in-memory cache across navigations
  });

  const songs = query.data?.pages.flatMap((p) => p.songs) ?? [];

  return {
    data:               query.data,
    error:              query.error,
    songs,
    fetchNextPage:      query.fetchNextPage,
    hasNextPage:        query.hasNextPage,
    isLoading:          query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch:            query.refetch,
  };
};