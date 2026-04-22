/**
 * client/src/hooks/useAlbum.js
 *
 * Task 2.4 — Hook Return Contract Standardization
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   + isError          — unified boolean (albumQuery.isError || songsQuery.isError)
 *   + refetch          — unified convenience alias (refetches both in parallel)
 *   + useErrorHandler  — auto-watches isError and toasts user-safe message
 *
 * UNCHANGED:
 *   - All React Query options (staleTime, retry, enabled, select) — untouched
 *   - Granular loading states (isAlbumLoading, isSongsLoading) — kept for
 *     progressive rendering in AlbumDetail.jsx
 *   - Granular refetch helpers (refetchAlbum, refetchSongs) — kept for
 *     cases where caller needs fine-grained control
 *   - Defensive defaults (null, []) — untouched
 *   - Parallel fetch strategy (both queries fire together, no waterfall) — untouched
 *
 * RETURN SHAPE (now fully standard):
 *   {
 *     // Data
 *     album:          Album | null,
 *     songs:          Song[],
 *
 *     // Standard contract (matches every other hook)
 *     isLoading:      boolean,   // true while either query is in flight (no cache)
 *     isError:        boolean,   // true if either query failed
 *     error:          Error | null,
 *     refetch:        () => void, // refetches both album + songs in parallel
 *
 *     // Granular (progressive rendering)
 *     isAlbumLoading: boolean,
 *     isSongsLoading: boolean,
 *     refetchAlbum:   () => void,
 *     refetchSongs:   () => void,
 *   }
 *
 * @module useAlbum
 */

import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';
import { getAlbum, getAlbumSongs } from '../services/albums.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useErrorHandler } from './useErrorHandler';

/**
 * @param {string | null | undefined} albumId
 * @returns {{
 *   album: import('../types/song').Album | null,
 *   songs: import('../types/song').Song[],
 *   isLoading: boolean,
 *   isError: boolean,
 *   error: Error | null,
 *   refetch: () => void,
 *   isAlbumLoading: boolean,
 *   isSongsLoading: boolean,
 *   refetchAlbum: () => void,
 *   refetchSongs: () => void,
 * }}
 */
export const useAlbum = (albumId) => {
  const isValidId = !!albumId && typeof albumId === 'string';

  // ── Album document ─────────────────────────────────────────────────────────
  const albumQuery = useQuery({
    queryKey:  [QUERY_KEYS.ALBUM, albumId],
    queryFn:   () => getAlbum(albumId),
    enabled:   isValidId,
    staleTime: 5 * 60 * 1000,
    retry: (failureCount, error) => {
      // 404 = album does not exist — no point retrying
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
  });

  // ── Album songs ────────────────────────────────────────────────────────────
  // Both queries fire in parallel (no waterfall). Songs render as soon as
  // they resolve, even if the album document is still loading.
  const songsQuery = useQuery({
    queryKey:  [QUERY_KEYS.ALBUM_SONGS, albumId],
    queryFn:   () => getAlbumSongs(albumId),
    enabled:   isValidId,
    staleTime: 2 * 60 * 1000,
    retry: (failureCount, error) => {
      if (error?.response?.status === 404) return false;
      return failureCount < 2;
    },
    // extractAlbumSongs returns { songs: [] } on bad payload — select normalizes it
    select: (data) => (Array.isArray(data?.songs) ? data.songs : []),
  });

  // ── Unified error — first error wins for toast display ────────────────────
  const error = albumQuery.error ?? songsQuery.error ?? null;
  const isError = albumQuery.isError || songsQuery.isError;

  // ── Auto-toast on error ────────────────────────────────────────────────────
  // useErrorHandler watches isError + error reactively. When either query fails,
  // the user sees a single friendly toast. Dedup logic in useErrorHandler
  // prevents double-toasting if both queries fail simultaneously.
  useErrorHandler({ error, isError, context: 'loading album' });

  // ── Unified refetch — fires both in parallel ───────────────────────────────
  const refetch = useCallback(() => {
    albumQuery.refetch();
    songsQuery.refetch();
  }, [albumQuery, songsQuery]);

  return {
    // ── Data ────────────────────────────────────────────────────────────────
    album: albumQuery.data ?? null,
    songs: songsQuery.data ?? [],

    // ── Standard contract ────────────────────────────────────────────────────
    isLoading: albumQuery.isLoading || songsQuery.isLoading,
    isError,
    error,
    refetch,

    // ── Granular states (progressive rendering in AlbumDetail.jsx) ───────────
    isAlbumLoading: albumQuery.isLoading,
    isSongsLoading: songsQuery.isLoading,

    // ── Granular refetch helpers ─────────────────────────────────────────────
    refetchAlbum: albumQuery.refetch,
    refetchSongs: songsQuery.refetch,
  };
};