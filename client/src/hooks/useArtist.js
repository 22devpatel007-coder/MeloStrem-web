/**
 * client/src/hooks/useArtist.js
 *
 * Task 2.4 — Hook Return Contract Standardization
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   + isError          — unified boolean (artistQuery.isError || songsQuery.isError)
 *   + refetch          — unified convenience alias (refetches both in parallel)
 *   + useErrorHandler  — auto-watches isError and toasts user-safe message
 *
 * UNCHANGED:
 *   - All React Query options (staleTime, retry, enabled, getNextPageParam) — untouched
 *   - useInfiniteQuery for songs (paginated) — untouched
 *   - songs flatMap across pages — untouched
 *   - Granular states (isSongsLoading, isFetchingNextPage, songsError) — kept
 *   - Granular refetch helpers (refetchArtist, refetchSongs) — kept
 *   - songLimit option — kept
 *   - Defensive defaults (null, [], false) — untouched
 *
 * RETURN SHAPE (now fully standard):
 *   {
 *     // Data
 *     artist:             Artist | null,
 *     songs:              Song[],
 *
 *     // Standard contract (matches every other hook)
 *     isLoading:          boolean,   // true while artist doc is in flight
 *     isError:            boolean,   // true if either query failed
 *     error:              Error | null,
 *     refetch:            () => void,
 *
 *     // Pagination (infinite query specific)
 *     fetchNextPage:      () => void,
 *     hasNextPage:        boolean,
 *     isFetchingNextPage: boolean,
 *
 *     // Granular
 *     isSongsLoading:     boolean,
 *     songsError:         Error | null,
 *     refetchArtist:      () => void,
 *     refetchSongs:       () => void,
 *   }
 *
 * @module useArtist
 */

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getArtist, getArtistSongs } from '../services/artists.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useErrorHandler } from './useErrorHandler';

const SONGS_PER_PAGE = 30;

/**
 * @param {string | null | undefined} artistId
 * @param {object} [options]
 * @param {number} [options.songLimit=30]  songs per page
 *
 * @returns {{
 *   artist: import('../types/song').Artist | null,
 *   songs: import('../types/song').Song[],
 *   isLoading: boolean,
 *   isError: boolean,
 *   error: Error | null,
 *   refetch: () => void,
 *   fetchNextPage: () => void,
 *   hasNextPage: boolean,
 *   isFetchingNextPage: boolean,
 *   isSongsLoading: boolean,
 *   songsError: Error | null,
 *   refetchArtist: () => void,
 *   refetchSongs: () => void,
 * }}
 */
export const useArtist = (artistId, { songLimit = SONGS_PER_PAGE } = {}) => {
  const isValidId = !!artistId && typeof artistId === 'string';

  // ── Artist document ────────────────────────────────────────────────────────
  const artistQuery = useQuery({
    queryKey:  [QUERY_KEYS.ARTIST, artistId],
    queryFn:   () => getArtist(artistId),
    enabled:   isValidId,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      // 404 = artist does not exist — component shows empty state, not error
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  // ── Artist songs (infinite / paginated) ────────────────────────────────────
  const songsQuery = useInfiniteQuery({
    queryKey:         [QUERY_KEYS.ARTIST_SONGS, artistId],
    queryFn:          ({ pageParam }) => getArtistSongs(artistId, songLimit, pageParam),
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    initialPageParam: null,
    enabled:          isValidId,
    staleTime:        2 * 60 * 1000,
  });

  // ── Flatten paginated pages ────────────────────────────────────────────────
  const songs = songsQuery.data?.pages.flatMap((p) => p.songs) ?? [];

  // ── Unified error — artist error takes priority ────────────────────────────
  const error   = artistQuery.error ?? songsQuery.error ?? null;
  const isError = artistQuery.isError || songsQuery.isError;

  // ── Auto-toast on error ────────────────────────────────────────────────────
  useErrorHandler({ error, isError, context: 'loading artist' });

  // ── Unified refetch — fires both in parallel ───────────────────────────────
  const refetch = useCallback(() => {
    artistQuery.refetch();
    songsQuery.refetch();
  }, [artistQuery, songsQuery]);

  return {
    // ── Data ─────────────────────────────────────────────────────────────────
    artist: artistQuery.data ?? null,
    songs,

    // ── Standard contract ─────────────────────────────────────────────────────
    isLoading: artistQuery.isLoading,
    isError,
    error,
    refetch,

    // ── Infinite query pagination ─────────────────────────────────────────────
    fetchNextPage:      songsQuery.fetchNextPage,
    hasNextPage:        songsQuery.hasNextPage ?? false,
    isFetchingNextPage: songsQuery.isFetchingNextPage,

    // ── Granular states ───────────────────────────────────────────────────────
    isSongsLoading: songsQuery.isLoading,
    songsError:     songsQuery.error ?? null,

    // ── Granular refetch helpers ──────────────────────────────────────────────
    refetchArtist: artistQuery.refetch,
    refetchSongs:  songsQuery.refetch,
  };
};