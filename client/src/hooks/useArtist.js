/**
 * client/src/hooks/useArtist.js
 *
 * React Query hook for Artist detail data.
 *
 * Follows the exact same pattern as useSongs.js:
 * - useQuery for the single artist document
 * - useInfiniteQuery for the artist's paginated song list
 * - Defensive defaults on every value (null, [], false)
 * - Stable query keys scoped to QUERY_KEYS constants
 *
 * Usage:
 *   const { artist, songs, fetchNextPage, hasNextPage, isLoading, error } = useArtist(artistId);
 *
 * Returns null artist (not an error) when artistId is falsy — callers should
 * guard on isLoading before rendering, then show a 404 state if artist is null
 * after loading completes.
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { getArtist, getArtistSongs } from '../services/artists.service';
import { QUERY_KEYS } from '../constants/queryKeys';

const SONGS_PER_PAGE = 30;

/**
 * @param {string | null | undefined} artistId
 * @param {object} [options]
 * @param {number} [options.songLimit=30]  songs per page
 */
export const useArtist = (artistId, { songLimit = SONGS_PER_PAGE } = {}) => {
  // ── Artist document ────────────────────────────────────────────────────
  const artistQuery = useQuery({
    queryKey:  [QUERY_KEYS.ARTIST, artistId],
    queryFn:   () => getArtist(artistId),
    // Only run when artistId is a non-empty string
    enabled:   !!artistId && typeof artistId === 'string',
    // Artist metadata rarely changes — cache for 5 minutes
    staleTime: 5 * 60 * 1000,
    // Return null on 404 rather than throwing — component shows empty state
    retry: (failureCount, error) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  // ── Artist songs (infinite / paginated) ───────────────────────────────
  const songsQuery = useInfiniteQuery({
    queryKey:        [QUERY_KEYS.ARTIST_SONGS, artistId],
    queryFn:         ({ pageParam }) => getArtistSongs(artistId, songLimit, pageParam),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: null,
    enabled:          !!artistId && typeof artistId === 'string',
    staleTime:        2 * 60 * 1000,
  });

  // Flatten paginated pages into a single songs array — same pattern as useSongs
  const songs = songsQuery.data?.pages.flatMap((p) => p.songs) ?? [];

  return {
    // Artist document
    artist:    artistQuery.data ?? null,
    isLoading: artistQuery.isLoading,
    error:     artistQuery.error ?? null,

    // Artist songs
    songs,
    fetchNextPage:      songsQuery.fetchNextPage,
    hasNextPage:        songsQuery.hasNextPage ?? false,
    isFetchingNextPage: songsQuery.isFetchingNextPage,
    isSongsLoading:     songsQuery.isLoading,
    songsError:         songsQuery.error ?? null,

    // Refetch helpers
    refetchArtist: artistQuery.refetch,
    refetchSongs:  songsQuery.refetch,
  };
};