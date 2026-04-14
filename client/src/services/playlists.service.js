/**
 * client/src/services/playlists.service.js
 *
 * PRODUCTION READY
 *
 * Changes from previous version:
 *   - fetchUserPlaylists: added try/catch with console.error so failures are
 *     visible in DevTools rather than surfacing as an opaque empty array.
 *     The error is re-thrown so React Query's `isError` / `error` fire correctly
 *     and the Sidebar can show "Couldn't load playlists." instead of
 *     silently showing "No playlists yet."
 *
 *   - fetchAdminPlaylists: same try/catch + re-throw pattern.
 *
 *   All other functions — completely unchanged.
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

export const getPlaylistSongs = async (songIds) => {
  if (!Array.isArray(songIds) || songIds.length === 0) return [];
  try {
    const res   = await api.post('/songs/batch', { ids: songIds });
    const songs = res?.data?.data ?? res?.data ?? [];
    return Array.isArray(songs) ? songs : [];
  } catch (err) {
    console.error('[playlists.service] getPlaylistSongs error:', err.message);
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