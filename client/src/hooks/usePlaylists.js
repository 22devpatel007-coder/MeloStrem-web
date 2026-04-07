import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as playlistsService from '../services/playlists.service';
import { QUERY_KEYS } from '../constants/queryKeys';
import { useState, useEffect } from 'react';

// ✅ FIX Bug 7: Previously imported `query` from firebase/firestore AND wrote
// `const query = useQuery(...)` in the same file — the Firestore `query`
// function was completely shadowed by the React Query result object.
// Every useUserPlaylists / useAdminPlaylists call to query(collection(...))
// was calling a plain object instead of a function — silent crash.
//
// Fix: rename the Firestore import to `firestoreQuery` so the two never clash.
import {
  collection,
  query as firestoreQuery,  // ✅ renamed — no longer shadows useQuery result
  where,
  orderBy,
  onSnapshot,
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

// ── usePlaylists — REST-backed via React Query ────────────────────────────────
export const usePlaylists = () => {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: [QUERY_KEYS.PLAYLISTS] });

  // ✅ Renamed to playlistsQuery — no conflict with Firestore query
  const playlistsQuery = useQuery({
    queryKey: [QUERY_KEYS.PLAYLISTS],
    queryFn: playlistsService.getPlaylists,
  });

  const create     = useMutation({ mutationFn: playlistsService.createPlaylist, onSuccess: invalidate });
  const update     = useMutation({ mutationFn: ({ id, data }) => playlistsService.updatePlaylist(id, data), onSuccess: invalidate });
  const remove     = useMutation({ mutationFn: playlistsService.deletePlaylist, onSuccess: invalidate });
  const addSong    = useMutation({ mutationFn: ({ playlistId, songId }) => playlistsService.addSongToPlaylist(playlistId, songId), onSuccess: invalidate });
  const removeSong = useMutation({ mutationFn: ({ playlistId, songId }) => playlistsService.removeSongFromPlaylist(playlistId, songId), onSuccess: invalidate });

  return {
    playlists:            playlistsQuery.data ?? [],
    isLoading:            playlistsQuery.isLoading,
    createPlaylist:       create.mutate,
    updatePlaylist:       update.mutate,
    deletePlaylist:       remove.mutate,
    addSongToPlaylist:    addSong.mutate,
    removeSongFromPlaylist: removeSong.mutate,
  };
};

// ── Timestamp normaliser ──────────────────────────────────────────────────────
function tsToMs(v) {
  if (!v) return 0;
  if (typeof v.toDate === 'function') return v.toDate().getTime();
  if (typeof v._seconds === 'number') return v._seconds * 1000 + Math.floor((v._nanoseconds || 0) / 1e6);
  const d = new Date(v);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// ── useUserPlaylists — real-time Firestore listener ───────────────────────────
export const useUserPlaylists = () => {
  const { user: currentUser } = useAuthStore();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setPlaylists([]);
      setLoading(false);
      return;
    }

    // ✅ Now correctly calls the Firestore query function (renamed to firestoreQuery)
    const q = firestoreQuery(
      collection(db, 'playlists'),
      where('ownerId', '==', currentUser.uid),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const userOwned = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => !p.isAdmin);
        setPlaylists(userOwned);
        setLoading(false);
      },
      (err) => {
        console.error('[useUserPlaylists] error:', err.message);
        setLoading(false);
      }
    );

    return unsub;
  }, [currentUser]);

  return { playlists, loading };
};

// ── useAdminPlaylists — real-time Firestore listener ─────────────────────────
export const useAdminPlaylists = () => {
  const [adminPlaylists, setAdminPlaylists] = useState([]);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    // ✅ Now correctly calls the Firestore query function
    const q = firestoreQuery(
      collection(db, 'playlists'),
      where('isAdmin', '==', true)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const adminOnes = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((p) => p.isPublic === true)
          .sort((a, b) => tsToMs(b.createdAt) - tsToMs(a.createdAt));
        setAdminPlaylists(adminOnes);
        setLoading(false);
      },
      (err) => {
        console.error('[useAdminPlaylists] error:', err.message);
        setLoading(false);
      }
    );

    return unsub;
  }, []);

  return { adminPlaylists, loading };
};

// ── usePlaylistMutations — direct Firestore writes ────────────────────────────
export const usePlaylistMutations = () => {
  const { user: currentUser } = useAuthStore();

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
    return ref.id;
  };

  const deletePlaylist = async (playlistId) => {
    await deleteDoc(doc(db, 'playlists', playlistId));
  };

  const updatePlaylist = async (playlistId, fields) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  };

  const addSongToPlaylist = async (playlistId, songId) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   arrayUnion(songId),
      updatedAt: serverTimestamp(),
    });
  };

  const removeSongFromPlaylist = async (playlistId, songId) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   arrayRemove(songId),
      updatedAt: serverTimestamp(),
    });
  };

  const reorderSongs = async (playlistId, newSongIds) => {
    await assertExists(playlistId);
    await updateDoc(doc(db, 'playlists', playlistId), {
      songIds:   newSongIds,
      updatedAt: serverTimestamp(),
    });
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