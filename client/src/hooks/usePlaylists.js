/**
 * client/src/hooks/usePlaylists.js
 *
 * PRODUCTION FIX — Request storm eliminated
 *
 * ROOT CAUSE (two bugs):
 *
 *   BUG 1 — usePlaylists() had NO staleTime (React Query default = 0ms).
 *     staleTime:0 = data immediately stale after every fetch.
 *     Every refetchOnWindowFocus (tab switch, window click) triggered a new
 *     POST /playlists request. Sidebar.jsx calls usePlaylists() on every
 *     mount, compounding the storm with the songs storm to produce the
 *     repeated 500 + 429 pattern visible in DevTools.
 *
 *   BUG 2 — Sidebar.jsx was calling usePlaylists(uid) which is the ADMIN
 *     CRUD hook. usePlaylists() ignores its argument (it has no uid param),
 *     fetches ALL playlists via GET /api/playlists (admin route), and has
 *     no cache policy. Sidebar should call useUserPlaylists() instead.
 *     (Fix for Sidebar is in Sidebar.jsx — see that file.)
 *
 * FIX applied here:
 *   Added staleTime + gcTime to usePlaylists (admin CRUD hook) so even if
 *   it's called from a non-admin context it doesn't storm the server.
 *
 *   staleTime: 2 minutes — admin playlists rarely change mid-session.
 *   gcTime:    10 minutes — keeps data across navigations.
 *
 * WHAT DID NOT CHANGE:
 *   - useUserPlaylists — already had staleTime: 30s (correct, untouched)
 *   - useAdminPlaylists — already had staleTime: 5min (correct, untouched)
 *   - usePlaylistMutations — untouched
 *   - All mutation functions — untouched
 *   - All return shapes — untouched
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getPlaylists,
  createPlaylist   as createPlaylistREST,
  updatePlaylist   as updatePlaylistREST,
  deletePlaylist   as deletePlaylistREST,
  addSongToPlaylist    as addSongREST,
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
// FIXED: added staleTime + gcTime to stop request storm on window focus.
export const usePlaylists = () => {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.PLAYLISTS] });

  const playlistsQuery = useQuery({
    queryKey: [QUERY_KEYS.PLAYLISTS],
    queryFn:  getPlaylists,
    // ── FIXED: was missing — default staleTime:0 caused refetch storm ────────
    staleTime: 2 * 60_000,   // 2 minutes — admin playlists rarely change mid-session
    gcTime:    10 * 60_000,  // 10 minutes in-memory cache
  });

  const create     = useMutation({ mutationFn: createPlaylistREST,                                             onSuccess: invalidate });
  const update     = useMutation({ mutationFn: ({ id, data }) => updatePlaylistREST(id, data),                 onSuccess: invalidate });
  const remove     = useMutation({ mutationFn: deletePlaylistREST,                                             onSuccess: invalidate });
  const addSong    = useMutation({ mutationFn: ({ playlistId, songId }) => addSongREST(playlistId, songId),    onSuccess: invalidate });
  const removeSong = useMutation({ mutationFn: ({ playlistId, songId }) => removeSongREST(playlistId, songId), onSuccess: invalidate });

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
// staleTime: 30s — already correct, untouched.
// This is what Sidebar.jsx should call (fixed in Sidebar.jsx).
export const useUserPlaylists = () => {
  const { user } = useAuthStore();
  const uid      = user?.uid ?? null;

  const query = useQuery({
    queryKey: [QUERY_KEYS.USER_PLAYLISTS, uid],
    queryFn:  () => fetchUserPlaylists(uid),
    enabled:  !!uid,
    staleTime: 30_000,       // 30 seconds — correct, untouched
    gcTime:    5 * 60_000,   // 5 minutes in-memory cache
  });

  return {
    playlists: query.data ?? [],
    loading:   query.isLoading,
  };
};

// ── useAdminPlaylists — REST via React Query ──────────────────────────────────
//
// Fetches GET /api/playlists/admin.
// staleTime: 5min — already correct, untouched.
export const useAdminPlaylists = () => {
  const query = useQuery({
    queryKey: [QUERY_KEYS.ADMIN_PLAYLISTS],
    queryFn:  fetchAdminPlaylists,
    staleTime: 5 * 60_000,   // 5 minutes — admin playlists rarely change
    gcTime:    10 * 60_000,  // 10 minutes in memory cache
  });

  return {
    adminPlaylists: query.data ?? [],
    loading:        query.isLoading,
  };
};

// ── usePlaylistMutations — direct Firestore writes + cache invalidation ───────
//
// Completely untouched. Write operations are one-shot, no persistent listeners.
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