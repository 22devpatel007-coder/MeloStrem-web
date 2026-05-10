/**
 * client/src/hooks/useSuggestions.js
 *
 * Hooks for playlist suggestion feature.
 * Follows the same patterns as usePlaylists.js and useSongs.js:
 *   - useQuery for reads, useMutation for writes
 *   - QUERY_KEYS for cache key consistency
 *   - defensive defaults
 */

import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { QUERY_KEYS } from '../constants/queryKeys';
import { submitSuggestion, fetchSuggestions, updateSuggestion, fetchMySuggestions } from '../services/suggestions.service';
import useAuthStore from '../store/authStore';

// ── User hook — submit a suggestion ──────────────────────────────────────────

/**
 * useSubmitSuggestion
 * Returns a mutation for submitting a playlist link.
 * The mutation does NOT invalidate any cache — submission is fire-and-move-on.
 */
export const useSubmitSuggestion = () => {
  return useMutation({
    mutationFn: submitSuggestion,
  });
};

// ── Admin hook — list all suggestions ────────────────────────────────────────

/**
 * useAdminSuggestions
 * Fetches all suggestions. Only runs when the user is an admin.
 * Follows the same enabled-guard pattern as admin hooks in usePlaylists.js.
 */
export const useUpdateSuggestion = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateSuggestion,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SUGGESTIONS] });
    },
  });
};

export const useMySubmissions = () => {
  const { user } = useAuthStore();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [QUERY_KEYS.SUGGESTIONS, 'mine', user?.uid],
    queryFn:  fetchMySuggestions,
    enabled:  !!user?.uid,
    staleTime: 30 * 1000,
  });
  return {
    submissions: data ?? [],
    loading: isLoading,
    isError,
    refetch,
  };
};
export const useAdminSuggestions = () => {
  const { isAdmin } = useAuthStore();

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey:        [QUERY_KEYS.SUGGESTIONS, 'admin'],
    queryFn:         fetchSuggestions,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled:          isAdmin,
    staleTime:        30 * 1000,
  });

  const suggestions = data?.pages.flatMap((p) => p.suggestions) ?? [];

  return {
    suggestions,
    loading: isLoading,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage:        hasNextPage ?? false,
    isFetchingNextPage: isFetchingNextPage ?? false,
  };
};