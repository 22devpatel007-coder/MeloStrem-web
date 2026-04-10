/**
 * client/src/services/playlists.service.js — FIXED (production-ready)
 *
 * BUG FIXED: "Query data cannot be undefined" for ["playlists"]
 * ──────────────────────────────────────────────────────────────
 * Root cause: `getPlaylists()` called `(await api.get('/playlists')).data.data`.
 * If the backend returns `{ success: true, data: null }` or any shape where
 * `.data.data` is undefined, React Query v5 throws:
 *   "Query data cannot be undefined. Please make sure to return a value
 *    other than undefined from your query function."
 *
 * Fix: all service functions now return a safe fallback (`[]` or `{}`) when
 * the chain resolves to undefined/null. This is defensive normalisation at the
 * service layer — consistent with CLAUDE.md rule §4 "Preserve service-level
 * normalisation so callers receive stable shapes even when backend varies."
 *
 * Also: getPlaylists now reads both `res.data.data` (envelope shape) AND
 * `res.data` (plain array shape) so it handles the mixed response envelope
 * situation documented in CONTEXT.md §Gaps.
 */

import api from './api';

// ── Helper: safely extract an array from varying response shapes ──────────────
function extractArray(res) {
  // Envelope shape: { success, data: [] }
  if (Array.isArray(res?.data?.data)) return res.data.data;
  // Plain array shape: { data: [] } (some endpoints)
  if (Array.isArray(res?.data))       return res.data;
  // Fallback — never return undefined
  return [];
}

// ── Helper: safely extract an object ─────────────────────────────────────────
function extractObject(res) {
  if (res?.data?.data && typeof res.data.data === 'object') return res.data.data;
  if (res?.data       && typeof res.data       === 'object') return res.data;
  return {};
}

export const getPlaylists = async () => {
  const res = await api.get('/playlists');
  return extractArray(res); // ✅ always returns [], never undefined
};

export const getPlaylistById = async (id) => {
  const res = await api.get(`/playlists/${id}`);
  return extractObject(res); // ✅ always returns {}, never undefined
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
  // DELETE may return null/empty — return a safe truthy ack object
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

/**
 * Fetches full Song objects for an array of song IDs in one round-trip.
 * POST /api/songs/batch with the ID array.
 * Returns Song[] — IDs not found are silently omitted.
 *
 * @param {string[]} songIds
 * @returns {Promise<Song[]>}
 */
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