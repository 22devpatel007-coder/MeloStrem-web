/**
 * client/src/hooks/usePlaylistMeta.js
 *
 * Task 2.4 — Hook Return Contract Standardization
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   + isError  — boolean alias for !!metaError (for consistency with other hooks)
 *   + useErrorHandler called imperatively for metaError (auto-toasts Firestore load failure)
 *
 * UNCHANGED (CRITICAL — do not touch):
 *   - All pin/unpin logic (arrayUnion/arrayRemove Firestore ops with optimistic rollback)
 *   - writeLastPlayed debounce (2s, fire-and-forget, never blocks playback)
 *   - inline rename (optimistic React Query cache update + rollback on error)
 *   - viewMode in localStorage
 *   - MAX_PINNED = 5
 *   - useLastPlayedWriter standalone export
 *   - All return fields (pinnedIds, isPinned, togglePin, pinPlaylist, unpinPlaylist,
 *     lastPlayed, writeLastPlayed, getLastPlayedLabel, renamingId, renameValue,
 *     setRenameValue, renameError, startRename, cancelRename, commitRename,
 *     viewMode, setViewMode, metaLoading, metaError)
 *
 * NOTE on standardization scope:
 *   usePlaylistMeta is a UI metadata hook, not a React Query data hook.
 *   It does NOT return { data, isLoading, isError, error, refetch } because
 *   it manages a diverse set of UI state concerns (pin, rename, lastPlayed, viewMode).
 *   The standard contract additions here are limited to isError for consistency.
 *
 * @module usePlaylistMeta
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, arrayRemove, serverTimestamp } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '../firebase';
import { useAuthStore } from '../store/authStore';
import { QUERY_KEYS } from '../constants/queryKeys';
import { updatePlaylist } from '../services/playlists.service';
import { useErrorHandler } from './useErrorHandler';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_PINNED               = 5;
const LAST_PLAYED_STALE_DAYS   = 7;
const RENAME_MAX_LENGTH        = 100;
const VIEW_MODE_KEY            = 'melostream_playlist_view';
const LAST_PLAYED_DEBOUNCE_MS  = 2000;

// ── Helpers ───────────────────────────────────────────────────────────────────
const getUserDocRef = (uid) => doc(db, 'users', uid);

const isLastPlayedStale = (timestamp) => {
  if (!timestamp) return true;
  const date    = timestamp?.toDate?.() ?? new Date(timestamp);
  const diffDays = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays > LAST_PLAYED_STALE_DAYS;
};

const formatRelativeTime = (timestamp) => {
  if (!timestamp) return null;
  const date     = timestamp?.toDate?.() ?? new Date(timestamp);
  const diffMs   = Date.now() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7)  return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  return null; // older than 30 days — hide
};

// ── Main Hook ─────────────────────────────────────────────────────────────────
export const usePlaylistMeta = () => {
  const { user } = useAuthStore();
  const uid      = user?.uid ?? null;
  const qc       = useQueryClient();

  // ── State ──────────────────────────────────────────────────────────────────
  const [pinnedIds,       setPinnedIds]       = useState([]);
  const [lastPlayed,      setLastPlayed]      = useState(null);
  const [metaLoading,     setMetaLoading]     = useState(true);
  const [metaError,       setMetaError]       = useState(null); // string | null
  const [renamingId,      setRenamingId]      = useState(null);
  const [renameValue,     setRenameValue]     = useState('');
  const [renameError,     setRenameError]     = useState(null);
  const [viewMode,        setViewModeState]   = useState(() => {
    try { return localStorage.getItem(VIEW_MODE_KEY) ?? 'grid'; }
    catch { return 'grid'; }
  });

  const lastPlayedDebounceRef = useRef(null);

  // ── Error handler for Firestore meta load failure ──────────────────────────
  // We create a synthetic Error so useErrorHandler can process it
  const metaErrorObj = metaError ? new Error(metaError) : null;
  useErrorHandler({
    error:   metaErrorObj,
    isError: !!metaError,
    context: 'loading playlists',
  });

  // ── Load user meta from Firestore on mount ─────────────────────────────────
  useEffect(() => {
    if (!uid) {
      setMetaLoading(false);
      return;
    }

    let cancelled = false;

    const loadMeta = async () => {
      setMetaLoading(true);
      setMetaError(null);
      try {
        const snap = await getDoc(getUserDocRef(uid));
        if (cancelled) return;

        if (snap.exists()) {
          const data = snap.data();
          setPinnedIds(Array.isArray(data.pinnedPlaylistIds) ? data.pinnedPlaylistIds : []);

          const lp = data.lastPlayedPlaylist ?? null;
          if (lp && !isLastPlayedStale(lp.timestamp)) {
            setLastPlayed(lp);
          } else {
            setLastPlayed(null);
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('[usePlaylistMeta] Failed to load user meta:', err.message);
          setMetaError('Failed to load playlist preferences.');
        }
      } finally {
        if (!cancelled) setMetaLoading(false);
      }
    };

    loadMeta();
    return () => { cancelled = true; };
  }, [uid]);

  // ── Pin / Unpin ────────────────────────────────────────────────────────────
  const pinPlaylist = useCallback(async (playlistId) => {
    if (!uid) return;
    if (pinnedIds.includes(playlistId)) return;
    if (pinnedIds.length >= MAX_PINNED) {
      throw new Error(`You can pin at most ${MAX_PINNED} playlists.`);
    }

    // Optimistic update
    setPinnedIds((prev) => [...prev, playlistId]);

    try {
      await updateDoc(getUserDocRef(uid), { pinnedPlaylistIds: arrayUnion(playlistId) });
    } catch (err) {
      // Rollback
      setPinnedIds((prev) => prev.filter((id) => id !== playlistId));
      console.error('[usePlaylistMeta] pinPlaylist failed:', err.message);
      throw new Error('Failed to pin playlist. Please try again.');
    }
  }, [uid, pinnedIds]);

  const unpinPlaylist = useCallback(async (playlistId) => {
    if (!uid) return;

    // Optimistic update
    setPinnedIds((prev) => prev.filter((id) => id !== playlistId));

    try {
      await updateDoc(getUserDocRef(uid), { pinnedPlaylistIds: arrayRemove(playlistId) });
    } catch (err) {
      // Rollback
      setPinnedIds((prev) => [...prev, playlistId]);
      console.error('[usePlaylistMeta] unpinPlaylist failed:', err.message);
      throw new Error('Failed to unpin playlist. Please try again.');
    }
  }, [uid]);

  const togglePin = useCallback(async (playlistId) => {
    if (pinnedIds.includes(playlistId)) return unpinPlaylist(playlistId);
    return pinPlaylist(playlistId);
  }, [pinnedIds, pinPlaylist, unpinPlaylist]);

  // ── Write lastPlayedPlaylist (debounced, fire-and-forget) ──────────────────
  const writeLastPlayed = useCallback((payload) => {
    if (!uid || !payload?.playlistId) return;
    if (lastPlayedDebounceRef.current) clearTimeout(lastPlayedDebounceRef.current);

    lastPlayedDebounceRef.current = setTimeout(async () => {
      try {
        await updateDoc(getUserDocRef(uid), {
          lastPlayedPlaylist: { ...payload, timestamp: serverTimestamp() },
        });
        setLastPlayed({ ...payload, timestamp: { toDate: () => new Date() } });
      } catch (err) {
        // Fire-and-forget — never throw, never block playback
        console.warn('[usePlaylistMeta] writeLastPlayed failed silently:', err.message);
      }
    }, LAST_PLAYED_DEBOUNCE_MS);
  }, [uid]);

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => { if (lastPlayedDebounceRef.current) clearTimeout(lastPlayedDebounceRef.current); };
  }, []);

  // ── Inline Rename ──────────────────────────────────────────────────────────
  const startRename = useCallback((playlist) => {
    setRenamingId(playlist.id);
    setRenameValue(playlist.name ?? '');
    setRenameError(null);
  }, []);

  const cancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue('');
    setRenameError(null);
  }, []);

  const commitRename = useCallback(async (playlistId, originalName) => {
    const trimmed = renameValue.trim();

    if (!trimmed) {
      setRenameError('Name cannot be empty.');
      return false;
    }
    if (trimmed.length > RENAME_MAX_LENGTH) {
      setRenameError(`Name must be ${RENAME_MAX_LENGTH} characters or fewer.`);
      return false;
    }
    if (trimmed === originalName) {
      cancelRename();
      return true;
    }

    // Optimistic update — update React Query cache immediately
    const updateCache = (newName) => {
      [QUERY_KEYS.USER_PLAYLISTS, QUERY_KEYS.PLAYLISTS].forEach((key) => {
        qc.setQueriesData({ queryKey: [key] }, (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((pl) => (pl.id === playlistId ? { ...pl, name: newName } : pl));
        });
      });
      if (uid) {
        qc.setQueriesData({ queryKey: [QUERY_KEYS.USER_PLAYLISTS, uid] }, (old) => {
          if (!Array.isArray(old)) return old;
          return old.map((pl) => (pl.id === playlistId ? { ...pl, name: trimmed } : pl));
        });
      }
    };

    updateCache(trimmed);
    setRenamingId(null);
    setRenameValue('');
    setRenameError(null);

    try {
      await updatePlaylist(playlistId, { name: trimmed });
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.USER_PLAYLISTS] });
      return true;
    } catch (err) {
      // Rollback cache
      updateCache(originalName);
      console.error('[usePlaylistMeta] commitRename failed:', err.message);
      throw new Error('Failed to rename playlist. Please try again.');
    }
  }, [renameValue, uid, qc, cancelRename]);

  // ── View Mode ──────────────────────────────────────────────────────────────
  const setViewMode = useCallback((mode) => {
    setViewModeState(mode);
    try { localStorage.setItem(VIEW_MODE_KEY, mode); }
    catch { /* localStorage unavailable — ignore */ }
  }, []);

  // ── Derived helpers ────────────────────────────────────────────────────────
  const getLastPlayedLabel = useCallback((playlistId) => {
    if (!lastPlayed || lastPlayed.playlistId !== playlistId) return null;
    return formatRelativeTime(lastPlayed.timestamp);
  }, [lastPlayed]);

  const isPinned = useCallback((playlistId) => pinnedIds.includes(playlistId), [pinnedIds]);

  return {
    // ── Pin ──────────────────────────────────────────────────────────────────
    pinnedIds,
    isPinned,
    togglePin,
    pinPlaylist,
    unpinPlaylist,
    maxPinned:    MAX_PINNED,
    pinnedAtMax:  pinnedIds.length >= MAX_PINNED,

    // ── Last played / resume ─────────────────────────────────────────────────
    lastPlayed,
    writeLastPlayed,
    getLastPlayedLabel,

    // ── Rename ───────────────────────────────────────────────────────────────
    renamingId,
    renameValue,
    setRenameValue,
    renameError,
    startRename,
    cancelRename,
    commitRename,

    // ── View mode ────────────────────────────────────────────────────────────
    viewMode,
    setViewMode,

    // ── Meta state ───────────────────────────────────────────────────────────
    metaLoading,
    metaError,
    isError: !!metaError,   // ← NEW: boolean alias for consistency with other hooks
  };
};

// ── useLastPlayedWriter ────────────────────────────────────────────────────────
// Lightweight hook for playerStore subscriber or MusicPlayer.
// Writes lastPlayedPlaylist to Firestore whenever playlist context is active.
// COMPLETELY UNCHANGED.
// ─────────────────────────────────────────────────────────────────────────────
export const useLastPlayedWriter = () => {
  const { user } = useAuthStore();
  const uid       = user?.uid ?? null;
  const debounceRef = useRef(null);

  const writeLastPlayed = useCallback((payload) => {
    if (!uid || !payload?.playlistId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        await updateDoc(doc(db, 'users', uid), {
          lastPlayedPlaylist: { ...payload, timestamp: serverTimestamp() },
        });
      } catch (err) {
        console.warn('[useLastPlayedWriter] silent fail:', err.message);
      }
    }, LAST_PLAYED_DEBOUNCE_MS);
  }, [uid]);

  useEffect(() => {
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, []);

  return { writeLastPlayed };
};