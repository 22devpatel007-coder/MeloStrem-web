/**
 * client/src/hooks/usePlaylists.js
 *
 * Task 2.4 — Hook Return Contract Standardization
 *
 * CHANGES FROM PREVIOUS VERSION:
 *
 *   usePlaylists (admin CRUD):
 *     + isError   — boolean (was missing)
 *     + error     — raw Error object (was missing)
 *     + refetch   — exposed from query (was missing)
 *     + useErrorHandler — auto-toasts on fetch failure
 *
 *   useUserPlaylists:
 *     + isLoading — alias for `loading` (KEPT `loading` for backward compat)
 *     + refetch   — exposed from query (was missing)
 *     + useErrorHandler — auto-toasts on fetch failure
 *     NOTE: `loading` is kept alongside `isLoading` so existing Sidebar.jsx
 *     callers do not need to be updated simultaneously. Remove `loading` in
 *     a follow-up cleanup PR once all callers migrate to `isLoading`.
 *
 *   useAdminPlaylists:
 *     + isLoading — alias for `loading` (KEPT `loading` for backward compat)
 *     + isError   — boolean (was missing)
 *     + error     — raw Error object (was missing)
 *     + refetch   — exposed from query (was missing)
 *     + useErrorHandler — auto-toasts on fetch failure
 *     NOTE: Same `loading` backward compat note as useUserPlaylists.
 *
 *   usePlaylistMutations:
 *     COMPLETELY UNCHANGED — direct Firestore writes, not React Query.
 *
 * UNCHANGED ACROSS ALL EXPORTS:
 *   - All React Query options (staleTime, gcTime, retry, refetchOnWindowFocus)
 *   - All mutation functions and their Firestore logic
 *   - queryKey structures
 *   - Defensive defaults ([])
 *   - cache invalidation patterns
 *
 * @module usePlaylists
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPlaylists,
  createPlaylist         as createPlaylistREST,
  updatePlaylist         as updatePlaylistREST,
  deletePlaylist         as deletePlaylistREST,
  addSongToPlaylist      as addSongREST,
  removeSongFromPlaylist as removeSongREST,
  fetchAdminPlaylists,
  fetchUserPlaylists,
} from '../services/playlists.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { useErrorHandler } from './useErrorHandler';

// ── usePlaylists — REST-backed admin CRUD ─────────────────────────────────────
//
// Used by admin pages to manage playlists (create/update/delete/addSong/removeSong).
//
// @returns {{
//   playlists:              import('../types/playlist').Playlist[],
//   isLoading:              boolean,
//   isError:                boolean,
//   error:                  Error | null,
//   refetch:                () => void,
//   createPlaylist:         (data: object) => void,
//   updatePlaylist:         ({ id: string, data: object }) => void,
//   deletePlaylist:         (id: string) => void,
//   addSongToPlaylist:      ({ playlistId: string, songId: string }) => void,
//   removeSongFromPlaylist: ({ playlistId: string, songId: string }) => void,
// }}
export const usePlaylists = () => {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.PLAYLISTS] });

  const playlistsQuery = useQuery({
    queryKey:             [QUERY_KEYS.PLAYLISTS],
    queryFn:              getPlaylists,
    staleTime:            2 * 60_000,
    gcTime:               10 * 60_000,
    retry:                1,
    refetchOnWindowFocus: false,
  });

  // Auto-toast on fetch failure
  useErrorHandler({
    error:    playlistsQuery.error,
    isError:  playlistsQuery.isError,
    context:  'loading playlists',
  });

  const create     = useMutation({ mutationFn: createPlaylistREST,                                             onSuccess: invalidate });
  const update     = useMutation({ mutationFn: ({ id, data }) => updatePlaylistREST(id, data),                 onSuccess: invalidate });
  const remove     = useMutation({ mutationFn: deletePlaylistREST,                                             onSuccess: invalidate });
  const addSong    = useMutation({ mutationFn: ({ playlistId, songId }) => addSongREST(playlistId, songId),    onSuccess: invalidate });
  const removeSong = useMutation({ mutationFn: ({ playlistId, songId }) => removeSongREST(playlistId, songId), onSuccess: invalidate });

  return {
    playlists:              playlistsQuery.data ?? [],
    isLoading:              playlistsQuery.isLoading,
    isError:                playlistsQuery.isError,           // ← NEW
    error:                  playlistsQuery.error   ?? null,   // ← NEW
    refetch:                playlistsQuery.refetch,            // ← NEW
    createPlaylist:         create.mutate,
    updatePlaylist:         update.mutate,
    deletePlaylist:         remove.mutate,
    addSongToPlaylist:      addSong.mutate,
    removeSongFromPlaylist: removeSong.mutate,
  };
};

// ── useUserPlaylists — REST via React Query ───────────────────────────────────
//
// Fetches GET /api/users/:uid/playlists.
// Called by Sidebar to render the user's playlist list.
//
// @returns {{
//   playlists: import('../types/playlist').Playlist[],
//   isLoading: boolean,
//   loading:   boolean,    ← KEPT for backward compat — remove in cleanup PR
//   isError:   boolean,
//   error:     Error | null,
//   refetch:   () => void,
// }}
export const useUserPlaylists = () => {
  const { user } = useAuthStore();
  const uid      = user?.uid ?? null;

  const query = useQuery({
    queryKey:             [QUERY_KEYS.USER_PLAYLISTS, uid],
    queryFn:              () => fetchUserPlaylists(uid),
    enabled:              !!uid,
    staleTime:            30_000,
    gcTime:               5 * 60_000,
    retry:                1,
    refetchOnWindowFocus: false,
  });

  // Auto-toast on fetch failure
  useErrorHandler({
    error:   query.error,
    isError: query.isError,
    context: 'loading playlists',
  });

  return {
    playlists: query.data  ?? [],
    isLoading: query.isLoading,              // ← NEW (standardized name)
    loading:   query.isLoading,              //    KEPT for backward compat
    isError:   query.isError,
    error:     query.error  ?? null,
    refetch:   query.refetch,                // ← NEW
  };
};

// ── useAdminPlaylists — REST via React Query ──────────────────────────────────
//
// Fetches GET /api/playlists/admin (public endpoint, dedicated rate limiter).
//
// @returns {{
//   adminPlaylists: import('../types/playlist').Playlist[],
//   isLoading:      boolean,
//   loading:        boolean,  ← KEPT for backward compat — remove in cleanup PR
//   isError:        boolean,
//   error:          Error | null,
//   refetch:        () => void,
// }}
export const useAdminPlaylists = () => {
  const query = useQuery({
    queryKey:             [QUERY_KEYS.ADMIN_PLAYLISTS],
    queryFn:              fetchAdminPlaylists,
    staleTime:            5 * 60_000,
    gcTime:               10 * 60_000,
    retry:                1,
    refetchOnWindowFocus: false,
  });

  // Auto-toast on fetch failure
  useErrorHandler({
    error:   query.error,
    isError: query.isError,
    context: 'loading playlists',
  });

  return {
    adminPlaylists: query.data  ?? [],
    isLoading:      query.isLoading,          // ← NEW (standardized name)
    loading:        query.isLoading,          //    KEPT for backward compat
    isError:        query.isError,            // ← NEW
    error:          query.error   ?? null,    // ← NEW
    refetch:        query.refetch,             // ← NEW
  };
};

// ── usePlaylistMutations — direct Firestore writes + cache invalidation ───────
//
// COMPLETELY UNCHANGED. Write operations are one-shot, no persistent listeners.
// This hook does not use React Query and therefore does not need standardization.
// ─────────────────────────────────────────────────────────────────────────────
export const usePlaylistMutations = () => {
  const { user: currentUser } = useAuthStore();
  const qc = useQueryClient();

  const invalidateUserPlaylists = () => {
    if (currentUser?.uid) {
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.USER_PLAYLISTS, currentUser.uid] });
    }
  };

  const assertExists = async (playlistId) => {
    const snap = await getDoc(doc(db, 'playlists', playlistId));
    if (!snap.exists()) {
      throw new Error(`Playlist "${playlistId}" no longer exists. It may have been deleted.`);
    }
    return snap;
  };

  const createPlaylist = async (name, description = '') => {
    if (!currentUser) throw new Error('Not authenticated');
    const ref = await addDoc(collection(db, 'playlists'), {
      name:        name.trim(),
      description: description.trim(),
      ownerId:     currentUser.uid,
      ownerEmail:  currentUser.email,
      songIds:     [],
      coverUrl:    '',
      coverType:   'auto',
      isPublic:    false,
      isAdmin:     false,
      isFeatured:  false,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    });
    invalidateUserPlaylists();
    return ref.id;
  };

  const deletePlaylist = async (playlistId) => {
    await deleteDoc(doc(db, 'playlists', playlistId));
    invalidateUserPlaylists();
  };

  const updatePlaylist = async (playlistId, fields) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
    invalidateUserPlaylists();
  };

  const addSongToPlaylist = async (playlistId, songId) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   arrayUnion(songId),
      updatedAt: serverTimestamp(),
    });
    invalidateUserPlaylists();
  };

  const removeSongFromPlaylist = async (playlistId, songId) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   arrayRemove(songId),
      updatedAt: serverTimestamp(),
    });
    invalidateUserPlaylists();
  };

  const reorderSongs = async (playlistId, newSongIds) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   newSongIds,
      updatedAt: serverTimestamp(),
    });
    invalidateUserPlaylists();
  };

  return {
    createPlaylist,
    deletePlaylist,
    updatePlaylist,
    addSongToPlaylist,
    removeSongFromPlaylist,
    reorderSongs,
  };
};