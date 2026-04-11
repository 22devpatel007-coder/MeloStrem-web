/**
 * client/src/services/playlists.service.js
 *
 * SCALABLE FIX — Two new service functions added:
 *
 *   fetchAdminPlaylists()        → GET /api/playlists/admin  (public)
 *   fetchUserPlaylists(uid)      → GET /api/users/:uid/playlists (protected)
 *
 * These are called by the updated useAdminPlaylists and useUserPlaylists hooks.
 * All existing functions are preserved exactly — zero breaking changes.
 */

import api from './api';

// ─── Helper: safely extract an array from varying response shapes ─────────────
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

// ─── NEW: REST replacements for Firestore onSnapshot listeners ────────────────

/**
 * Fetches all public admin/library playlists.
 * Replaces useAdminPlaylists Firestore onSnapshot.
 * Calls GET /api/playlists/admin — public endpoint, no auth header needed
 * (Axios interceptor still attaches it if present, which is harmless).
 *
 * Returns Playlist[] — always an array, never undefined.
 *
 * @returns {Promise<Playlist[]>}
 */
export const fetchAdminPlaylists = async () => {
  const res = await api.get('/playlists/admin');
  return extractArray(res);
};

/**
 * Fetches all playlists owned by the given user.
 * Replaces useUserPlaylists Firestore onSnapshot.
 * Calls GET /api/users/:uid/playlists — protected, token required.
 *
 * Returns Playlist[] — always an array, never undefined.
 *
 * @param {string} uid
 * @returns {Promise<Playlist[]>}
 */
export const fetchUserPlaylists = async (uid) => {
  if (!uid) return [];
  const res = await api.get(`/users/${uid}/playlists`);
  return extractArray(res);
};