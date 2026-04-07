import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getLikedSongs, toggleLikeSong } from '../services/users.service';
import { QUERY_KEYS } from '../constants/queryKeys';

// ── useLikedSongs ─────────────────────────────────────────────────────────────
// PERMANENT FIX: Backend now returns Song[] (full objects) instead of string[].
//
// This hook exposes:
//   likedSongs    → Song[]    — full objects for LikedSongs page rendering
//   likedSongIds  → string[]  — ID set for O(1) heart-icon checks in SongCard
//   isLoading     → boolean
//   toggleLike    → (songId: string) => void  — optimistic toggle
//
// Optimistic update: we optimistically remove/add the Song object from the
// cached Song[] using the songId, so the UI responds instantly without waiting
// for the server round-trip.
// ─────────────────────────────────────────────────────────────────────────────

export const useLikedSongs = (uid) => {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: [QUERY_KEYS.LIKED_SONGS, uid],
    queryFn: () => getLikedSongs(uid),
    enabled: !!uid,
    // Liked songs are user-scoped; 30s stale time is a safe balance between
    // freshness and avoiding redundant fetches on re-focus.
    staleTime: 30_000,
  });

  // Derive ID set from the Song[] for cheap membership checks
  const likedSongs = query.data ?? [];
  const likedSongIds = likedSongs.map((s) => s.id);

  const toggle = useMutation({
    mutationFn: (songId) => toggleLikeSong(uid, songId),

    onMutate: async (songId) => {
      await qc.cancelQueries({ queryKey: [QUERY_KEYS.LIKED_SONGS, uid] });
      const previous = qc.getQueryData([QUERY_KEYS.LIKED_SONGS, uid]);

      qc.setQueryData([QUERY_KEYS.LIKED_SONGS, uid], (old = []) => {
        const alreadyLiked = old.some((s) => s.id === songId);

        if (alreadyLiked) {
          // Remove from optimistic list
          return old.filter((s) => s.id !== songId);
        }

        // Add a lightweight placeholder so the count updates instantly.
        // The real Song object arrives after invalidation on onSettled.
        // We use a minimal shape so SongList doesn't crash on missing fields.
        return [...old, { id: songId, title: '', artist: '', coverUrl: '', audioUrl: '', duration: 0 }];
      });

      return { previous };
    },

    onError: (_err, _songId, context) => {
      // Roll back to the pre-mutation snapshot on any error
      qc.setQueryData([QUERY_KEYS.LIKED_SONGS, uid], context.previous);
    },

    onSettled: () => {
      // Always re-fetch after settle so full Song objects replace any placeholders
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.LIKED_SONGS, uid] });
    },
  });

  return {
    likedSongs,       // Song[] — use for rendering lists
    likedSongIds,     // string[] — use for isLiked checks in SongCard
    isLoading: query.isLoading,
    isError: query.isError,
    toggleLike: toggle.mutate,
    isToggling: toggle.isPending,
  };
};

// ── useToggleLikeSong ─────────────────────────────────────────────────────────
// Standalone toggle for use outside of the LikedSongs page context
// (e.g. SongCard, SongContextMenu). Invalidates on success so the shared
// cache stays fresh.
// ─────────────────────────────────────────────────────────────────────────────
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