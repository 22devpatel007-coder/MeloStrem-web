/**
 * hooks/useSearch.js  — FIXED (production-ready)
 *
 * BUG FIXED: "refetch is not a function"
 * ─────────────────────────────────────────
 * Root cause: When `enabled: false`, React Query v5 returns a stub object
 * where `refetch` is present but calling it is a no-op AND in some edge cases
 * the query result object shape is incomplete. The real crash happened because
 * Search.jsx destructured `refetch` from useSearch but useSearch was NOT
 * forwarding it — it only returned { data, isLoading, isError }.
 *
 * Fix: explicitly return `refetch` from the hook so callers always get a
 * callable function regardless of enabled state.
 *
 * ALSO FIXED: infinite loop in Search.jsx line 199
 * ─────────────────────────────────────────────────
 * Root cause: `data?.songs` as a useMemo dependency in Search.jsx creates a
 * new array reference on every render even when the underlying data hasn't
 * changed, because optional chaining on undefined returns a new `undefined`
 * each time — but more importantly the `songs` array returned from
 * `searchSongs()` was a new reference on every call.
 *
 * The safe fix here is to stabilise the query key so React Query correctly
 * caches and does NOT re-run the queryFn on every render. We also guard
 * against null/undefined rawQuery so debouncing never receives undefined.
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { searchSongs } from '../services/search.service';
import { QUERY_KEYS } from '../constants/queryKeys';

export const useSearch = (rawQuery = '', limit = 20) => {
  // Normalise: always a string, trimmed
  const normalised = (rawQuery ?? '').trim();

  const [debouncedQuery, setDebouncedQuery] = useState(normalised);

  useEffect(() => {
    const normalised = (rawQuery ?? '').trim();
    const timer = setTimeout(() => setDebouncedQuery(normalised), 400);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const result = useQuery({
    queryKey: [QUERY_KEYS.SEARCH, debouncedQuery, limit],
    queryFn:  () => searchSongs(debouncedQuery, limit),
    // Only fire when there is a meaningful query
    enabled:  debouncedQuery.length > 1,
    staleTime: 30_000,
    // ✅ Always return a stable empty shape so callers never receive undefined
    placeholderData: { songs: [], total: 0, query: '' },
  });

  return {
    data:      result.data,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    isError:   result.isError,
    error:     result.error,
    // ✅ Always expose refetch so destructuring in Search.jsx never crashes
    refetch:   result.refetch,
  };
};