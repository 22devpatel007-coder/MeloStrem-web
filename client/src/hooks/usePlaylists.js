/**
 * client/src/hooks/usePlaylists.js
 *
 * PRODUCTION READY
 *
 * Changes from previous version:
 *
 *   useUserPlaylists:
 *     - Added `retry: 1`          — one automatic retry on network blip
 *     - Added `refetchOnWindowFocus: false` — prevents request storm on tab switch
 *     - Exposed `error` and `isError` in return — Sidebar shows "Couldn't load"
 *       instead of silently showing "No playlists yet." on fetch failure
 *
 *   useAdminPlaylists:
 *     - Added `retry: 1` and `refetchOnWindowFocus: false` — same reason
 *
 *   usePlaylists (admin CRUD hook):
 *     - Added `refetchOnWindowFocus: false` — already had staleTime, this
 *       removes the remaining window-focus refetch vector
 *
 *   usePlaylistMutations — completely unchanged.
 *   All mutation functions — completely unchanged.
 *   All return shapes unchanged except useUserPlaylists which now also
 *   returns { error, isError }.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPlaylists,
  createPlaylist        as createPlaylistREST,
  updatePlaylist        as updatePlaylistREST,
  deletePlaylist        as deletePlaylistREST,
  addSongToPlaylist     as addSongREST,
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

// ── usePlaylists — REST-backed admin CRUD ─────────────────────────────────────
//
// Used by admin pages to manage playlists (create/update/delete/addSong/removeSong).
export const usePlaylists = () => {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.PLAYLISTS] });

  const playlistsQuery = useQuery({
    queryKey:             [QUERY_KEYS.PLAYLISTS],
    queryFn:              getPlaylists,
    staleTime:            2 * 60_000,   // 2 minutes
    gcTime:               10 * 60_000,  // 10 minutes
    retry:                1,
    refetchOnWindowFocus: false,
  });

  const create     = useMutation({ mutationFn: createPlaylistREST,                                              onSuccess: invalidate });
  const update     = useMutation({ mutationFn: ({ id, data }) => updatePlaylistREST(id, data),                  onSuccess: invalidate });
  const remove     = useMutation({ mutationFn: deletePlaylistREST,                                              onSuccess: invalidate });
  const addSong    = useMutation({ mutationFn: ({ playlistId, songId }) => addSongREST(playlistId, songId),     onSuccess: invalidate });
  const removeSong = useMutation({ mutationFn: ({ playlistId, songId }) => removeSongREST(playlistId, songId),  onSuccess: invalidate });

  return {
    playlists:              playlistsQuery.data ?? [],
    isLoading:              playlistsQuery.isLoading,
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
// Returns: { playlists, loading, error, isError }
//   - playlists: always an array (never undefined)
//   - loading:   true only on the initial fetch (no prior cache)
//   - isError:   true if the fetch failed after all retries
//   - error:     the raw Error object (for logging); never shown to users directly
export const useUserPlaylists = () => {
  const { user } = useAuthStore();
  const uid      = user?.uid ?? null;

  const query = useQuery({
    queryKey:             [QUERY_KEYS.USER_PLAYLISTS, uid],
    queryFn:              () => fetchUserPlaylists(uid),
    enabled:              !!uid,
    staleTime:            30_000,      // 30 seconds
    gcTime:               5 * 60_000,  // 5 minutes
    retry:                1,           // one retry on network blip, then surface error
    refetchOnWindowFocus: false,       // prevents request storm on tab switch
  });

  return {
    playlists: query.data ?? [],
    loading:   query.isLoading,
    error:     query.error   ?? null,  // raw Error — for dev logging only
    isError:   query.isError,          // boolean — drives Sidebar error state
  };
};

// ── useAdminPlaylists — REST via React Query ──────────────────────────────────
//
// Fetches GET /api/playlists/admin (public endpoint).
export const useAdminPlaylists = () => {
  const query = useQuery({
    queryKey:             [QUERY_KEYS.ADMIN_PLAYLISTS],
    queryFn:              fetchAdminPlaylists,
    staleTime:            5 * 60_000,   // 5 minutes
    gcTime:               10 * 60_000,  // 10 minutes
    retry:                1,
    refetchOnWindowFocus: false,
  });

  return {
    adminPlaylists: query.data ?? [],
    loading:        query.isLoading,
  };
};

// ── usePlaylistMutations — direct Firestore writes + cache invalidation ───────
//
// Completely unchanged. Write operations are one-shot, no persistent listeners.
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