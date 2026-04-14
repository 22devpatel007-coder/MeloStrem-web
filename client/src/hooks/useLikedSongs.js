/**
 * client/src/hooks/useLikedSongs.js
 *
 * Task 2.4 — Hook Return Contract Standardization
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   + error            — raw Error object (was missing, consumers had no way to log it)
 *   + refetch          — exposed from query (was missing, callers couldn't force refresh)
 *   + useErrorHandler  — auto-watches isError and toasts user-safe message
 *
 * UNCHANGED (CRITICAL — do not touch):
 *   - Optimistic update logic in onMutate (placeholder song + rollback) — untouched
 *   - likedSongs (Song[]) and likedSongIds (string[]) derivation — untouched
 *   - toggleLike and isToggling — untouched
 *   - onError rollback — untouched
 *   - onSettled invalidation (replaces placeholders with real data) — untouched
 *   - useToggleLikeSong standalone export — untouched
 *   - staleTime (30s), enabled guard — untouched
 *
 * RETURN SHAPE (now fully standard):
 *   {
 *     likedSongs:    Song[],      // full objects for LikedSongs page
 *     likedSongIds:  string[],    // ID set for O(1) SongCard heart checks
 *     isLoading:     boolean,
 *     isError:       boolean,
 *     error:         Error | null,   // ← NEW
 *     refetch:       () => void,     // ← NEW
 *     toggleLike:    (songId: string) => void,
 *     isToggling:    boolean,
 *   }
 *
 * @module useLikedSongs
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLikedSongs, toggleLikeSong } from '../services/users.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useErrorHandler } from './useErrorHandler';

// ── useLikedSongs ─────────────────────────────────────────────────────────────

/**
 * @param {string | null | undefined} uid  — Firebase user UID
 *
 * @returns {{
 *   likedSongs:   import('../types/song').Song[],
 *   likedSongIds: string[],
 *   isLoading:    boolean,
 *   isError:      boolean,
 *   error:        Error | null,
 *   refetch:      () => void,
 *   toggleLike:   (songId: string) => void,
 *   isToggling:   boolean,
 * }}
 */
export const useLikedSongs = (uid) => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [QUERY_KEYS.LIKED_SONGS, uid],
    queryFn:  () => getLikedSongs(uid),
    enabled:  !!uid,
    // 30s stale time — safe balance between freshness and redundant fetches
    staleTime: 30_000,
  });

  // ── Auto-toast on load failure ─────────────────────────────────────────────
  useErrorHandler({ error: query.error, isError: query.isError, context: 'loading liked songs' });

  // ── Derived values ─────────────────────────────────────────────────────────
  const likedSongs   = query.data ?? [];
  const likedSongIds = likedSongs.map((s) => s.id);

  // ── Optimistic toggle mutation ─────────────────────────────────────────────
  // IMPORTANT: This logic is untouched. Do not modify the optimistic update
  // pattern — it is carefully designed to handle concurrent toggles safely.
  const toggle = useMutation({
    mutationFn: (songId) => toggleLikeSong(uid, songId),

    onMutate: async (songId) => {
      // Cancel any in-flight refetches to prevent them overwriting our optimistic update
      await qc.cancelQueries({ queryKey: [QUERY_KEYS.LIKED_SONGS, uid] });
      const previous = qc.getQueryData([QUERY_KEYS.LIKED_SONGS, uid]);

      qc.setQueryData([QUERY_KEYS.LIKED_SONGS, uid], (old = []) => {
        const alreadyLiked = old.some((s) => s.id === songId);

        if (alreadyLiked) {
          // Unlike — remove from list immediately
          return old.filter((s) => s.id !== songId);
        }

        // Like — add lightweight placeholder so count updates instantly.
        // onSettled invalidation replaces this with the real Song object.
        return [
          ...old,
          { id: songId, title: '', artist: '', coverUrl: '', audioUrl: '', duration: 0 },
        ];
      });

      return { previous };
    },

    onError: (_err, _songId, context) => {
      // Roll back to the pre-mutation snapshot
      qc.setQueryData([QUERY_KEYS.LIKED_SONGS, uid], context.previous);
    },

    onSettled: () => {
      // Always re-fetch after settle — replaces placeholders with full Song objects
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.LIKED_SONGS, uid] });
    },
  });

  return {
    likedSongs,
    likedSongIds,
    isLoading:  query.isLoading,
    isError:    query.isError,
    error:      query.error   ?? null,   // ← NEW: raw error for dev logging
    refetch:    query.refetch,            // ← NEW: allow callers to force refresh
    toggleLike: toggle.mutate,
    isToggling: toggle.isPending,
  };
};

// ── useToggleLikeSong ─────────────────────────────────────────────────────────
// Standalone toggle for use outside of the LikedSongs page context
// (e.g. SongCard, SongContextMenu). Invalidates on success so the shared
// cache stays fresh.
// UNCHANGED from previous version.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @returns {{ mutate: ({ uid: string, songId: string }) => void, isPending: boolean }}
 */
export const useToggleLikeSong = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ uid, songId }) => toggleLikeSong(uid, songId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.LIKED_SONGS, variables.uid],
      });
    },
  });
};