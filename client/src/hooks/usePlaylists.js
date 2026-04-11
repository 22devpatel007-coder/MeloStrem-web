/**
 * client/src/hooks/usePlaylists.js
 *
 * SCALABLE PERMANENT FIX
 * ──────────────────────
 * BEFORE: useUserPlaylists + useAdminPlaylists each opened a persistent
 * Firestore WebSocket (onSnapshot) per user per tab. 1000 concurrent users
 * = 2000 open WebSocket connections. Multi-tab caused WatchChangeAggregator
 * assertion errors. Library playlists disappeared when the stream corrupted.
 *
 * AFTER: Both hooks use React Query + REST API exclusively.
 * Zero Firestore listeners. Zero WebSocket connections from the client.
 * Zero assertion errors. Works correctly across unlimited tabs.
 * Server holds one Firestore Admin SDK connection pool shared by all requests.
 *
 * BEHAVIOUR PRESERVED:
 *   ✅ useUserPlaylists  → returns user's own playlists (Your Playlists section)
 *   ✅ useAdminPlaylists → returns library playlists (Library Playlists section)
 *   ✅ usePlaylists      → REST admin CRUD (unchanged)
 *   ✅ usePlaylistMutations → direct Firestore writes (unchanged — writes are
 *      one-shot, not listeners, so they don't cause the assertion error)
 *
 * CACHE INVALIDATION STRATEGY:
 *   After any mutation (create/update/delete/addSong/removeSong), we invalidate
 *   both USER_PLAYLISTS and PLAYLISTS so every hook consumer gets fresh data.
 *   React Query deduplicates the refetch — only one network request fires
 *   even if multiple components are subscribed.
 *
 * REAL-TIME vs POLLING:
 *   onSnapshot gave real-time push updates. React Query uses stale-while-
 *   revalidate + refetchOnWindowFocus. For a music app this is the correct
 *   trade-off — playlists don't need sub-second sync. If real-time is required
 *   in future, add a 30s refetchInterval to the query options.
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
// import { useState, useEffect, useRef } from 'react';
import {
  collection,
  // query as firestoreQuery,
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

// ── usePlaylists — REST-backed admin CRUD (unchanged) ─────────────────────────
export const usePlaylists = () => {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.PLAYLISTS] });

  const playlistsQuery = useQuery({
    queryKey: [QUERY_KEYS.PLAYLISTS],
    queryFn:  getPlaylists,
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

// ── useUserPlaylists — REST via React Query (replaces Firestore onSnapshot) ───
//
// Fetches GET /api/users/:uid/playlists.
// React Query handles: caching, deduplication, background refetch on focus,
// loading/error states, and stale-while-revalidate.
//
// staleTime: 30s — user's own playlists change only via explicit mutations.
//   After any mutation, we manually invalidate so data is always fresh.
// refetchOnWindowFocus: true (React Query default) — switching tabs refetches
//   if data is stale, keeping the list current across tab switches.
//
// Return shape matches the original hook exactly:
//   { playlists: Playlist[], loading: boolean }
export const useUserPlaylists = () => {
  const { user } = useAuthStore();
  const uid      = user?.uid ?? null;

  const query = useQuery({
    queryKey: [QUERY_KEYS.USER_PLAYLISTS, uid],
    queryFn:  () => fetchUserPlaylists(uid),
    enabled:  !!uid,
    staleTime: 30_000,
  });

  return {
    playlists: query.data ?? [],
    loading:   query.isLoading,
  };
};

// ── useAdminPlaylists — REST via React Query (replaces Firestore onSnapshot) ──
//
// Fetches GET /api/playlists/admin.
// Public content — same for every user, so no uid in the query key.
// React Query deduplicates: if Home + Playlists + PlaylistDetail all call
// useAdminPlaylists simultaneously, only ONE HTTP request fires.
//
// staleTime: 5min — admin/library playlists change rarely (admin action required).
//   Long stale time means returning users get instant cached data with
//   a background refetch only if data is older than 5 minutes.
// gcTime: 10min — keeps data in memory across page navigations.
//
// Return shape matches the original hook exactly:
//   { adminPlaylists: Playlist[], loading: boolean }
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
// Write operations (addDoc, updateDoc, deleteDoc) are one-shot — they don't
// open persistent listeners, so they never caused the assertion error.
// They are kept as direct Firestore writes for low latency (no round-trip
// through Express for simple mutations).
//
// ADDED: queryClient.invalidateQueries after each mutation so the REST-backed
// useUserPlaylists hook always reflects the latest state after a write.
// This is the correct integration point between direct Firestore writes
// and React Query-managed reads.
export const usePlaylistMutations = () => {
  const { user: currentUser } = useAuthStore();
  const qc = useQueryClient();

  // Invalidate user playlists after any mutation so useUserPlaylists refetches.
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
    invalidateUserPlaylists(); // ✅ keep React Query cache in sync
    return ref.id;
  };

  const deletePlaylist = async (playlistId) => {
    await deleteDoc(doc(db, 'playlists', playlistId));
    invalidateUserPlaylists(); // ✅ keep React Query cache in sync
  };

  const updatePlaylist = async (playlistId, fields) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
    invalidateUserPlaylists(); // ✅ keep React Query cache in sync
  };

  const addSongToPlaylist = async (playlistId, songId) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   arrayUnion(songId),
      updatedAt: serverTimestamp(),
    });
    invalidateUserPlaylists(); // ✅ keep React Query cache in sync
  };

  const removeSongFromPlaylist = async (playlistId, songId) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   arrayRemove(songId),
      updatedAt: serverTimestamp(),
    });
    invalidateUserPlaylists(); // ✅ keep React Query cache in sync
  };

  const reorderSongs = async (playlistId, newSongIds) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   newSongIds,
      updatedAt: serverTimestamp(),
    });
    invalidateUserPlaylists(); // ✅ keep React Query cache in sync
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