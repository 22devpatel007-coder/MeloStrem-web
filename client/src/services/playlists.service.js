/**
 * client/src/services/playlists.service.js
 *
 * PRODUCTION READY
 *
 * Changes from previous version:
 *   - getPlaylistSongs [BUG-007 FIX]:
 *       1. Deduplicates songIds BEFORE the batch request using Set — avoids
 *          sending duplicate IDs to the server and wasting Firestore reads.
 *       2. Deduplicates songs in the response by `id` — defensive against the
 *          backend returning duplicate song objects when given duplicate IDs
 *          via db.getAll (Firestore's getAll does not deduplicate).
 *       3. Preserves original playlist ordering — the response is re-ordered
 *          to match the deduplicated input ID sequence, so the UI renders songs
 *          in the order they were added to the playlist, not Firestore document
 *          order.
 *       4. Logs a DEV-only warning (not an error) when duplicates are detected,
 *          so data issues are visible during development without polluting
 *          production logs.
 *
 * All other functions — completely unchanged.
 */

import api from './api';

// ─── Helper: safely extract an array from varying response shapes ─────────────
//
// Handles three backend envelope shapes defensively:
//   { data: { data: [...] } }   →  Axios wraps { success, data: [...] }
//   { data: [...] }             →  Axios wraps a raw array
//   anything else               →  []
function extractArray(res) {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data))       return res.data;
  return [];
}

// ─── Helper: safely extract an object ────────────────────────────────────────
function extractObject(res) {
  if (res?.data?.data && typeof res.data.data === 'object') return res.data.data;
  if (res?.data       && typeof res.data       === 'object') return res.data;
  return {};
}

// ─── EXISTING functions — completely unchanged ────────────────────────────────

export const getPlaylists = async () => {
  const res = await api.get('/playlists');
  return extractArray(res);
};

export const getPlaylistById = async (id) => {
  const res = await api.get(`/playlists/${id}`);
  return extractObject(res);
};

export const createPlaylist = async (data) => {
  const res = await api.post('/playlists', data);
  return extractObject(res);
};

export const updatePlaylist = async (id, data) => {
  const res = await api.put(`/playlists/${id}`, data);
  return extractObject(res);
};

export const deletePlaylist = async (id) => {
  const res = await api.delete(`/playlists/${id}`);
  return res?.data?.data ?? res?.data ?? { deleted: true };
};

export const addSongToPlaylist = async (playlistId, songId) => {
  const res = await api.post(`/playlists/${playlistId}/songs`, { songId });
  return extractObject(res);
};

export const removeSongFromPlaylist = async (playlistId, songId) => {
  const res = await api.delete(`/playlists/${playlistId}/songs/${songId}`);
  return res?.data?.data ?? res?.data ?? { removed: true };
};

// ─── getPlaylistSongs — POST /api/songs/batch ────────────────────────────────
//
// BUG-007 FIX: Two-pass deduplication.
//
// Pass 1 (pre-request): Build a unique, ordered ID list from the input.
//   - A playlist can accumulate duplicate IDs through repeated addSongToPlaylist
//     calls or corrupted data. Sending duplicates to the server causes Firestore
//     db.getAll to resolve the same document multiple times, returning duplicate
//     song objects.
//
// Pass 2 (post-response): Deduplicate by song `id` and restore playlist order.
//   - Firestore db.getAll does not guarantee order. We use the deduped input
//     sequence as the source-of-truth order, and build an id→song Map from the
//     response so the final array matches the original playlist track order.
//   - Songs missing from the response (deleted from Firestore) are silently
//     dropped — this is the correct behavior and was already implicit.
//
// Ordering contract:
//   Input:    ['a', 'b', 'a', 'c', 'b']
//   Deduped:  ['a', 'b', 'c']           ← sent to server
//   Response: [songC, songA, songB]      ← Firestore order (arbitrary)
//   Output:   [songA, songB, songC]      ← restored to deduped-input order
//
export const getPlaylistSongs = async (songIds) => {
  if (!Array.isArray(songIds) || songIds.length === 0) return [];

  // ── Pass 1: deduplicate input IDs while preserving first-seen order ────────
  const uniqueIds = [...new Set(songIds.filter(Boolean))];

  if (process.env.NODE_ENV !== 'production' && uniqueIds.length !== songIds.length) {
    console.warn(
      `[playlists.service] getPlaylistSongs: received ${songIds.length} IDs, ` +
      `${songIds.length - uniqueIds.length} duplicate(s) removed before batch request.`
    );
  }

  if (uniqueIds.length === 0) return [];

  try {
    const res   = await api.post('/songs/batch', { ids: uniqueIds });
    const songs = res?.data?.data ?? res?.data ?? [];

    if (!Array.isArray(songs)) return [];

    // ── Pass 2: build id→song map, then restore input order ─────────────────
    // The Map handles any backend-side duplicates (same id appearing twice in
    // the response). Last-write-wins is fine here because all instances of the
    // same song object are identical.
    const songMap = new Map(
      songs
        .filter((s) => s?.id)
        .map((s) => [s.id, s])
    );

    // Re-order by the deduplicated input sequence; drop IDs not in the response
    // (song was deleted from Firestore — correct to omit silently).
    return uniqueIds.reduce((acc, id) => {
      const song = songMap.get(id);
      if (song) acc.push(song);
      return acc;
    }, []);
  } catch (err) {
    console.error('[playlists.service] getPlaylistSongs error:', err.message);
    throw err;
  }
};
// ─── getPlaylistSongsPaged — paginated batch fetch ────────────────────────────
// Fetches one page of playlist songs by slicing the songIds array client-side.
// page is 0-indexed. Returns { songs, hasMore, nextPage }.
export const getPlaylistSongsPaged = async (songIds, page = 0, limit = 20) => {
  if (!Array.isArray(songIds) || songIds.length === 0) {
    return { songs: [], hasMore: false, nextPage: null };
  }

  const uniqueIds = [...new Set(songIds.filter(Boolean))];
  const start     = page * limit;
  const pageIds   = uniqueIds.slice(start, start + limit);

  if (pageIds.length === 0) {
    return { songs: [], hasMore: false, nextPage: null };
  }

  try {
    const res   = await api.post('/songs/batch', { ids: pageIds });
    const songs = res?.data?.data ?? res?.data ?? [];

    if (!Array.isArray(songs)) return { songs: [], hasMore: false, nextPage: null };

    const songMap = new Map(songs.filter((s) => s?.id).map((s) => [s.id, s]));
    const ordered = pageIds.reduce((acc, id) => {
      const song = songMap.get(id);
      if (song) acc.push(song);
      return acc;
    }, []);

    const hasMore = start + limit < uniqueIds.length;
    return { songs: ordered, hasMore, nextPage: hasMore ? page + 1 : null };
  } catch (err) {
    console.error('[playlists.service] getPlaylistSongsPaged error:', err.message);
    throw err;
  }
};
// ─── fetchAdminPlaylists — GET /api/playlists/admin ──────────────────────────
//
// Public endpoint — no uid required.
// Re-throws on failure so React Query isError fires and UI can show error state.
export const fetchAdminPlaylists = async () => {
  try {
    const res = await api.get('/playlists/admin');
    return extractArray(res);
  } catch (err) {
    console.error('[playlists.service] fetchAdminPlaylists error:', err.message);
    throw err;
  }
};

// ─── fetchUserPlaylists — GET /api/users/:uid/playlists ──────────────────────
//
// Protected — Axios interceptor attaches the Firebase ID token automatically.
// Returns [] immediately if uid is falsy (user not yet authenticated).
// Re-throws on failure so React Query isError fires and Sidebar shows the
// "Couldn't load playlists." error message instead of silent empty state.
export const fetchUserPlaylists = async (uid) => {
  if (!uid) return [];
  try {
    const res = await api.get(`/users/${uid}/playlists`);
    return extractArray(res);
  } catch (err) {
    console.error('[playlists.service] fetchUserPlaylists error:', err.message);
    throw err;   // ← critical: must re-throw so React Query sets isError=true
  }
};