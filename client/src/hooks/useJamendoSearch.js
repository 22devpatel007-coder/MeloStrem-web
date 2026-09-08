/**
 * client/src/hooks/useJamendoSearch.js
 *
 * React Query infinite-pagination hook for the Jamendo Discover page.
 *
 * PAGINATION (see jamendoService.js on the backend for the full contract):
 *   Jamendo's API never reports a total match count — the only reliable way
 *   to know "is there more?" is whether the last page came back full. This
 *   hook keeps requesting subsequent offsets via fetchNextPage() until
 *   Jamendo returns a short page.
 *
 * RANDOMIZED "ALL" BROWSING:
 *   When there is no search term AND no genre tag selected ("All"), Jamendo
 *   has no documented `order=random` (verified against their public API
 *   docs — the supported order values are relevance/popularity/date/name
 *   etc., not random). Relying on an undocumented parameter value is not
 *   production-safe: it can be silently ignored or start erroring after any
 *   upstream API change with no warning to us.
 *
 *   Instead, "random" is implemented client-side with a standard, safe
 *   pattern:
 *     1. Pick a random starting offset (bounded — see ALL_BROWSE_MAX_RANDOM_
 *        OFFSET) once per browsing session (component mount, or whenever the
 *        user returns to "All" after using search/tags).
 *     2. Shuffle each fetched page's order client-side for extra visual
 *        variety within a page.
 *     3. FALLBACK: if the randomly-chosen offset happens to be past the end
 *        of the real result set for this query (first page comes back
 *        empty), automatically retry once at offset 0 instead of showing a
 *        false "no results" state. Jamendo's catalog size isn't published
 *        per-query, so this is the safe way to handle an occasional bad roll
 *        without guessing at real catalog size.
 *     4. "Load more" continues forward from that same starting point using
 *        the normal hasMore/nextOffset contract — pagination is not
 *        re-randomized mid-session, only the starting point is.
 *   A `reshuffle()` function is exposed so the UI can offer an explicit
 *   "Shuffle" action that re-rolls the starting point and refetches.
 *
 * Deliberately simpler than useSongs.js otherwise: no shuffle-seed logic
 * tied to the Firestore library, no registerPaginationBridge — Discover is
 * its own playback context ('discover'), so playerStore's library
 * pagination bridge never touches this data.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { searchJamendo } from '../services/jamendo.service';
import { useErrorHandler } from './useErrorHandler';

const DEBOUNCE_MS = 400; // matches useSearch.js's API-execution debounce convention
const DEFAULT_LIMIT = 40; // per-page size; "Load more" fetches additional pages of this size

// Heuristic upper bound for the random starting offset when browsing "All"
// (no query, no tag). Jamendo doesn't publish a total-match count for a
// query, so this can't be computed exactly — it's chosen conservatively
// relative to Jamendo's known catalog size (several hundred thousand
// CC-licensed, downloadable tracks) to make random starts feel varied
// without frequently overshooting into empty territory. If Jamendo's
// available (audiodownload-enabled) catalog size changes significantly,
// revisit this constant.
const ALL_BROWSE_MAX_RANDOM_OFFSET = 500;

function _randomOffset() {
  return Math.floor(Math.random() * ALL_BROWSE_MAX_RANDOM_OFFSET);
}

/** Fisher–Yates shuffle — returns a new array, never mutates the input. */
function _shuffle(arr) {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.tags]  comma-separated Jamendo tag filter, e.g. 'acoustic'
 * @param {number} [opts.limit] page size (defaults to DEFAULT_LIMIT)
 *
 * @returns {{
 *   query:              string,
 *   setQuery:           (q: string) => void,
 *   clearQuery:         () => void,
 *   tracks:             object[],
 *   total:              number,
 *   isLoading:          boolean,
 *   isFetching:         boolean,
 *   isFetchingNextPage: boolean,
 *   hasNextPage:        boolean,
 *   fetchNextPage:      () => void,
 *   isBrowseAll:        boolean,
 *   reshuffle:          () => void,
 *   isError:            boolean,
 *   error:              Error | null,
 *   refetch:            () => void,
 * }}
 */
export const useJamendoSearch = ({ tags = '', limit = DEFAULT_LIMIT } = {}) => {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const debounceRef = useRef(null);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const isBrowseAll = debouncedQuery.length === 0 && tags.trim().length === 0;

  // Bumping this forces a new random starting offset AND a fresh cache
  // entry (it's part of the queryKey below) — used both when the user
  // switches back into "All" mode and when they explicitly hit Shuffle.
  const [shuffleTick, setShuffleTick] = useState(0);

  // Recomputed only when the browsing mode actually changes (not on every
  // render), so "All" doesn't silently re-randomize itself while the user
  // is just scrolling or loading more pages.
  const randomStartOffset = useMemo(
    () => (isBrowseAll ? _randomOffset() : 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isBrowseAll, tags, shuffleTick],
  );

  const reshuffle = useCallback(() => {
    setShuffleTick((t) => t + 1);
  }, []);

  const result = useInfiniteQuery({
    queryKey: ['jamendo', 'search', debouncedQuery, tags, limit, isBrowseAll ? randomStartOffset : 'fixed'],
    queryFn: async ({ pageParam }) => {
      const page = await searchJamendo({ query: debouncedQuery, tags, limit, offset: pageParam });

      // Safety fallback: a random starting offset can occasionally land
      // past the real end of this query's result set. Rather than showing
      // a false "no results" for what is really just a bad random roll,
      // retry once at offset 0.
      if (isBrowseAll && pageParam > 0 && page.songs.length === 0) {
        return searchJamendo({ query: debouncedQuery, tags, limit, offset: 0 });
      }

      return page;
    },
    initialPageParam: randomStartOffset,
    getNextPageParam: (lastPage) => (lastPage?.hasMore ? lastPage.nextOffset : undefined),
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
  });

  useErrorHandler({
    error: result.error,
    isError: result.isError,
    context: 'discovering music',
  });

  // Flatten pages into one list, de-duped by id. Pages fetched while
  // browsing "All" are shuffled client-side for visual variety within the
  // page (Jamendo's own default ordering is stable/deterministic); pages
  // from an explicit search or tag filter are left in the order Jamendo
  // returned them, since relevance/tag ordering is meaningful there.
  const tracks = useMemo(() => {
    const pages = result.data?.pages ?? [];
    const seen = new Set();
    const flat = [];
    for (const page of pages) {
      const pageSongs = Array.isArray(page?.songs) ? page.songs : [];
      const ordered = isBrowseAll ? _shuffle(pageSongs) : pageSongs;
      for (const t of ordered) {
        if (t?.id && !seen.has(t.id)) {
          seen.add(t.id);
          flat.push(t);
        }
      }
    }
    return flat;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result.data, isBrowseAll]);

  const clearQuery = useCallback(() => setQuery(''), []);

  return {
    query,
    setQuery,
    clearQuery,
    tracks,
    total: tracks.length,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isFetchingNextPage: result.isFetchingNextPage,
    hasNextPage: !!result.hasNextPage,
    fetchNextPage: result.fetchNextPage,
    isBrowseAll,
    reshuffle,
    isError: result.isError,
    error: result.error ?? null,
    refetch: result.refetch,
  };
};