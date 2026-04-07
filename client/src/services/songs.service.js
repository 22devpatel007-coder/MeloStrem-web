/**
 * client/src/services/songs.service.js
 *
 * Fix: extractSongs normalization is now applied at the service layer, not
 * just at the hook layer. This means every caller — hooks, admin pages,
 * one-off components — always receives a safe { songs, nextCursor, hasMore }
 * shape regardless of what the server actually returned.
 *
 * extractSongs rules:
 *   - If payload is already { songs: [] } shape → use it.
 *   - If payload is a raw array (legacy / accidental) → wrap it.
 *   - If payload is anything else (null, undefined, error object) → safe default.
 *
 * getSongById, createSong, updateSong, deleteSong are single-record operations
 * and do not use extractSongs — they use extractSong (singular) instead.
 */

import api from './api';

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Normalizes a paginated songs response into a stable shape.
 * Never throws — returns a safe default on any unexpected input.
 *
 * @param {unknown} payload
 * @returns {{ songs: Song[], nextCursor: string | null, hasMore: boolean }}
 */
export const extractSongs = (payload) => {
  if (!payload || typeof payload !== 'object') {
    console.warn('[songs.service] extractSongs: unexpected payload type', typeof payload);
    return { songs: [], nextCursor: null, hasMore: false };
  }

  // Array response — wrap defensively (should not happen per API contract but guard anyway).
  if (Array.isArray(payload)) {
    console.warn('[songs.service] extractSongs: received raw array — expected object payload');
    return { songs: payload, nextCursor: null, hasMore: false };
  }

  const songs = Array.isArray(payload.songs) ? payload.songs : [];
  const nextCursor = payload.nextCursor ?? null;
  const hasMore = typeof payload.hasMore === 'boolean' ? payload.hasMore : false;

  if (!Array.isArray(payload.songs)) {
    console.warn('[songs.service] extractSongs: songs field missing or non-array', payload);
  }

  return { songs, nextCursor, hasMore };
};

/**
 * Normalizes a single-song response.
 * Returns null if the payload is not a usable song object.
 *
 * @param {unknown} payload
 * @returns {Song | null}
 */
export const extractSong = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[songs.service] extractSong: unexpected payload', payload);
    return null;
  }
  return payload;
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Unwraps Axios response data — handles both { data: payload } and bare payload.
 * Axios puts response body in res.data. Some interceptors re-wrap it; unwrap once.
 */
const unwrap = (res) => res?.data ?? res;

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetches a paginated page of songs.
 * Always returns a normalized { songs, nextCursor, hasMore } object.
 *
 * @param {number} limit
 * @param {string | null} cursor  - Firestore document ID for cursor pagination
 * @returns {Promise<{ songs: Song[], nextCursor: string | null, hasMore: boolean }>}
 */
export const getSongs = async (limit = 20, cursor = null) => {
  const params = { limit };
  if (cursor) params.cursor = cursor;
  const res = await api.get('/songs', { params });
  return extractSongs(unwrap(res));
};

/**
 * Fetches a single song by ID.
 * Returns null if the song is not found or the payload is unexpected.
 *
 * @param {string} id
 * @returns {Promise<Song | null>}
 */
export const getSongById = async (id) => {
  const res = await api.get(`/songs/${id}`);
  return extractSong(unwrap(res));
};

/**
 * Creates a new song via multipart/form-data upload.
 * Returns the created song object or null on unexpected response.
 *
 * @param {FormData} formData
 * @returns {Promise<Song | null>}
 */
export const createSong = async (formData) => {
  const res = await api.post('/songs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return extractSong(unwrap(res));
};

/**
 * Updates a song by ID.
 * Returns the updated song object or null on unexpected response.
 *
 * @param {string} id
 * @param {Partial<Song>} data
 * @returns {Promise<Song | null>}
 */
export const updateSong = async (id, data) => {
  const res = await api.patch(`/songs/${id}`, data);
  return extractSong(unwrap(res));
};

/**
 * Deletes a song by ID.
 * Returns the raw deletion response (typically { success: true } or similar).
 *
 * @param {string} id
 * @returns {Promise<unknown>}
 */
export const deleteSong = async (id) => {
  const res = await api.delete(`/songs/${id}`);
  return unwrap(res);
};