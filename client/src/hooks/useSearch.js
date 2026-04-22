/**
 * client/src/hooks/useSearch.js
 *
 * Task 2.4 — Hook Return Contract Standardization
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   + songs         — convenience field (data?.songs ?? []) so callers don't
 *                     need to drill into data.songs themselves. data is still
 *                     exposed for backward compat (Search.jsx uses data directly).
 *   + total         — convenience field (data?.total ?? 0)
 *   + useErrorHandler — auto-watches isError and toasts user-safe message
 *
 * UNCHANGED (CRITICAL — do not touch):
 *   - Split debounce: 400ms on API execution (SearchBar owns 300ms URL debounce)
 *   - enabled guard: debouncedQuery.length > 1 (prevents single-char API calls)
 *   - placeholderData: stable empty shape (prevents undefined crashes in callers)
 *   - refetch: explicitly exposed (fixes the "refetch is not a function" crash)
 *   - staleTime: 30s
 *   - Stable query key (prevents infinite loop fixed in previous version)
 *   - rawQuery null-safety (rawQuery ?? '')
 *
 * RETURN SHAPE (now fully standard):
 *   {
 *     // Standard contract
 *     isLoading:  boolean,
 *     isFetching: boolean,
 *     isError:    boolean,
 *     error:      Error | null,
 *     refetch:    () => void,
 *
 *     // Data
 *     songs:      Song[],      ← NEW convenience field
 *     total:      number,      ← NEW convenience field
 *     data:       { songs: Song[], total: number, query: string } | undefined,
 *   }
 *
 * @module useSearch
 */

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { searchSongs } from '../services/search.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useErrorHandler } from './useErrorHandler';

/**
 * @param {string} [rawQuery='']
 * @param {number} [limit=20]
 *
 * @returns {{
 *   songs:      import('../types/song').Song[],
 *   total:      number,
 *   data:       { songs: Song[], total: number, query: string } | undefined,
 *   isLoading:  boolean,
 *   isFetching: boolean,
 *   isError:    boolean,
 *   error:      Error | null,
 *   refetch:    () => void,
 * }}
 */
export const useSearch = (rawQuery = '', limit = 20) => {
  // Normalise: always a string, trimmed
  const normalised = (rawQuery ?? '').trim();

  const [debouncedQuery, setDebouncedQuery] = useState(normalised);

  // 400ms API execution debounce.
  // SearchBar owns the 300ms URL update debounce separately (CLAUDE.md §3).
  useEffect(() => {
    const normalised = (rawQuery ?? '').trim();
    const timer = setTimeout(() => setDebouncedQuery(normalised), 400);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  const result = useQuery({
    queryKey: [QUERY_KEYS.SEARCH, debouncedQuery, limit],
    queryFn:  () => searchSongs(debouncedQuery, limit),
    // Only fire when there is a meaningful query (> 1 char)
    enabled:  debouncedQuery.length > 1,
    staleTime: 30_000,
    // Stable empty shape — callers never receive undefined on first render
    placeholderData: { songs: [], total: 0, query: '' },
  });

  // Auto-toast on search failure
  useErrorHandler({
    error:   result.error,
    isError: result.isError,
    context: 'loading search results',
  });

  return {
    // ── Standard contract ────────────────────────────────────────────────────
    isLoading:  result.isLoading,
    isFetching: result.isFetching,
    isError:    result.isError,
    error:      result.error   ?? null,
    refetch:    result.refetch,           // always callable, even when enabled:false

    // ── Data ─────────────────────────────────────────────────────────────────
    songs: result.data?.songs ?? [],      // ← NEW: direct access, no drilling
    total: result.data?.total ?? 0,       // ← NEW: direct access
    data:  result.data,                   // kept for backward compat (Search.jsx)
  };
};