/**
 * client/src/hooks/useAlbum.js
 *
 * React Query hook for Album detail data.
 *
 * Uses useQuery (not useInfiniteQuery) for both album and songs because:
 * - Album detail shows all songs at once (non-paginated, bounded list)
 * - SongList component renders the complete ordered track list
 *
 * Follows the same pattern as useArtist / useSongs:
 * - Defensive defaults on every value
 * - Stable query keys scoped to QUERY_KEYS constants
 * - 404 does not retry — component shows empty/not-found state
 *
 * Usage:
 *   const { album, songs, isLoading, error } = useAlbum(albumId);
 */

import { useQuery } from '@tanstack/react-query';
import { getAlbum, getAlbumSongs } from '../services/albums.service';
import { QUERY_KEYS } from '../constants/queryKeys';

/**
 * @param {string | null | undefined} albumId
 */
export const useAlbum = (albumId) => {
  // ── Album document ─────────────────────────────────────────────────────
  const albumQuery = useQuery({
    queryKey:  [QUERY_KEYS.ALBUM, albumId],
    queryFn:   () => getAlbum(albumId),
    enabled:   !!albumId && typeof albumId === 'string',
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  // ── Album songs ────────────────────────────────────────────────────────
  // Only fetch songs once we know the album exists (or at minimum once albumId
  // is available). We don't gate on albumQuery.isSuccess to avoid a waterfall —
  // both queries fire in parallel and songs render when both resolve.
  const songsQuery = useQuery({
    queryKey:  [QUERY_KEYS.ALBUM_SONGS, albumId],
    queryFn:   () => getAlbumSongs(albumId),
    enabled:   !!albumId && typeof albumId === 'string',
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
    // extractAlbumSongs already returns { songs: [] } on bad payload
    select: (data) => Array.isArray(data?.songs) ? data.songs : [],
  });

  return {
    // Album document
    album:     albumQuery.data ?? null,
    isLoading: albumQuery.isLoading || songsQuery.isLoading,
    error:     albumQuery.error ?? songsQuery.error ?? null,

    // Album songs — always a safe array, ordered by trackNumber from the server
    songs: songsQuery.data ?? [],

    // Granular loading states for progressive rendering
    isAlbumLoading: albumQuery.isLoading,
    isSongsLoading: songsQuery.isLoading,

    // Refetch helpers
    refetchAlbum: albumQuery.refetch,
    refetchSongs: songsQuery.refetch,
  };
};