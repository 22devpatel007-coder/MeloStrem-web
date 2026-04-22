/**
 * client/src/hooks/useSongs.js
 *
 * PATCH — Pagination bridge registration (permanent fix for "stops at 50 songs").
 *
 * NEW BEHAVIOUR:
 *   After the hook mounts, it registers a pagination bridge with playerStore.
 *   The bridge lets playerStore.playNext() request the next page of songs when
 *   the queue runs out in 'library' context, and then resume playback once the
 *   new songs arrive.
 *
 * HOW IT WORKS (three new pieces, all in this file):
 *
 *   1. useEffect — registerPaginationBridge()
 *      Registers { fetchNextPage, hasNextPage getter, appendSongs } with
 *      playerStore once on mount. Re-registers only when fetchNextPage identity
 *      changes (React Query guarantees it's stable across re-renders).
 *      Bridge is registered with a hasNextPage *getter* (not the value) so
 *      playerStore always reads the live React Query value, not a stale closure.
 *
 *   2. useRef previousPageCountRef
 *      Tracks how many pages were loaded on the previous render.
 *      Used by the append effect to know when a genuinely new page has arrived.
 *
 *   3. useEffect — append new page to queue
 *      Fires when a new page is fetched (pageCount increases).
 *      Extracts only the newest page's songs (last element of data.pages).
 *      Calls playerStore.appendSongsToQueue(newPageSongs) which:
 *        a) calls queueStore.appendSongs() to grow the queue
 *        b) if _pendingNextAfterFetch is true, immediately calls playNext()
 *      This effect is a no-op on initial load (previousPageCount === 0) and
 *      on any render that doesn't increase pageCount (cache hits, refetches
 *      that return the same page count).
 *
 * UNCHANGED — every other function, shape, and behaviour:
 *   - staleTime (2min) and gcTime (10min)
 *   - useInfiniteQuery with cursor pagination
 *   - queryKey, queryFn, getNextPageParam, initialPageParam
 *   - songs flatMap across pages
 *   - fetchNextPage, hasNextPage, isFetchingNextPage
 *   - isError, error, refetch
 *   - useErrorHandler
 *   - getViewportLimit() helper
 *
 * @module useSongs
 */

import { useEffect, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getSongs } from '../services/songs.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useErrorHandler } from './useErrorHandler';
import {
  registerPaginationBridge,
  appendSongsToQueue,
} from '../store/playerStore';
import useQueueStore from '../store/queueStore';

// ── Viewport-aware initial page size ──────────────────────────────────────────
//
// Calculates how many song rows fit in the current viewport height and adds a
// small buffer so the user never sees a blank gap below the last row.
//
// SONG_ROW_HEIGHT must match SONG_ROW_HEIGHT in SongList.jsx (61px).
// VIEWPORT_BUFFER is extra rows fetched beyond what's visible — gives the
// virtualizer enough rows to fill overscan without a second fetch.
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

  // ── Pagination bridge registration ────────────────────────────────────────
  //
  // Register once on mount (and if fetchNextPage identity ever changes, which
  // React Query guarantees won't happen under normal conditions).
  //
  // hasNextPage is passed as a *getter function* so playerStore always reads
  // the current React Query value, not a stale closure captured at registration
  // time. This is critical: if we passed `query.hasNextPage` directly, the
  // bridge would always see the value from the render when it was registered.
  //
  // appendSongs is the queueStore action, accessed via getState() to avoid
  // stale closure issues with the Zustand store.
  //
  useEffect(() => {
    registerPaginationBridge({
      fetchNextPage: query.fetchNextPage,
      hasNextPage:   () => query.hasNextPage ?? false,
      appendSongs:   (newSongs) => useQueueStore.getState().appendSongs(newSongs),
    });
  }, [query.fetchNextPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Append new page to queue when a fresh page arrives ───────────────────
  //
  // previousPageCountRef tracks the page count from the previous render.
  // When pageCount increases, a new page has arrived — extract just the newest
  // page's songs and pass them to playerStore.appendSongsToQueue().
  //
  // Why only the last page, not all pages?
  //   - All earlier pages are already in the queue from previous fetches.
  //   - Sending all pages would cause duplicate detection overhead and potential
  //     re-ordering of already-queued songs.
  //
  // This effect is a no-op on:
  //   - Initial render (previousPageCount === 0, pageCount === 0)
  //   - First page load (previousPageCount === 0 — we don't append page 1
  //     because it was already used to setQueue when the user pressed play)
  //   - Re-renders where pageCount didn't change (cache hits, window focus
  //     refetches that return the same data)
  //
  const previousPageCountRef = useRef(0);

  useEffect(() => {
    const pages = query.data?.pages;
    if (!pages) return;

    const pageCount = pages.length;

    // Only act when a genuinely new page arrives (not on initial load)
    if (pageCount > 1 && pageCount > previousPageCountRef.current) {
      const newestPage = pages[pageCount - 1];
      const newPageSongs = Array.isArray(newestPage?.songs) ? newestPage.songs : [];

      if (newPageSongs.length > 0) {
        appendSongsToQueue(newPageSongs);
      }
    }

    previousPageCountRef.current = pageCount;
  }, [query.data?.pages]);

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