/**
 * client/src/services/songs.service.js
 *
 * Phase 2 — Task 2.2: Model Transformation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What changed from Phase 1 version:
 *   - extractSong() now enforces field-level defaults matching Song.fromFirestore()
 *     on the backend. Both layers agree on the exact shape a Song has.
 *   - The backend Song model now always returns clean, normalized shapes, so
 *     frontend normalization is a DEFENSIVE THIN LAYER only — it does not need
 *     to reconstruct missing fields, just guard against unexpected payloads.
 *   - All function signatures, export names, and behavior are IDENTICAL to the
 *     Phase 1 version. No call sites need to change.
 *
 * What did NOT change:
 *   - extractSongs() shape and envelope handling: unchanged.
 *   - getSongs, getSongById, createSong, updateSong, deleteSong: unchanged.
 *   - unwrap() helper: unchanged.
 *   - All console.warn paths: preserved.
 *
 * Frontend Song shape contract (mirrors Song.fromFirestore output):
 *   id, title, artist, genre, album, duration,
 *   audioUrl (NOT fileUrl — backend model exposes audioUrl as the canonical name),
 *   coverUrl, titleLower, artistLower,
 *   artistId (string | null), albumId (string | null), trackNumber (number | null),
 *   playCount, featured, uploadedBy, createdAt, updatedAt
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

  if (Array.isArray(payload)) {
    console.warn('[songs.service] extractSongs: received raw array — expected object payload');
    return { songs: payload.map(extractSong).filter(Boolean), nextCursor: null, hasMore: false };
  }

  const songs      = Array.isArray(payload.songs) ? payload.songs.map(extractSong).filter(Boolean) : [];
  const nextCursor = payload.nextCursor ?? null;
  const hasMore    = typeof payload.hasMore === 'boolean' ? payload.hasMore : false;

  if (!Array.isArray(payload.songs)) {
    console.warn('[songs.service] extractSongs: songs field missing or non-array', payload);
  }

  return { songs, nextCursor, hasMore };
};

/**
 * Normalizes a single Song response object.
 *
 * Phase 2.2 update: applies field-level defaults so every Song the frontend
 * receives has the same shape regardless of whether it came from a legacy
 * Firestore document or a new one written by the Phase 2 backend.
 *
 * Returns null only if payload is null/undefined/non-object/array.
 * Never returns null for a valid object — always returns a complete Song shape.
 *
 * @param {unknown} payload
 * @returns {Song | null}
 */
export const extractSong = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[songs.service] extractSong: unexpected payload', payload);
    return null;
  }

  // fileUrl → audioUrl alias: backend Song.fromFirestore() exposes audioUrl,
  // but legacy documents may have only fileUrl. Handle both here for safety.
  const audioUrl = payload.audioUrl || payload.fileUrl || '';

  return {
    id:               typeof payload.id          === 'string'  ? payload.id               : '',
    title:            typeof payload.title        === 'string'  ? payload.title.trim()     : '',
    artist:           typeof payload.artist       === 'string'  ? payload.artist.trim()    : '',
    genre:            typeof payload.genre        === 'string'  ? payload.genre.trim()     : '',
    album:            typeof payload.album        === 'string'  ? payload.album.trim()     : '',
    duration:         typeof payload.duration     === 'number'  ? payload.duration         : 0,
    audioUrl,
    coverUrl:         typeof payload.coverUrl     === 'string'  ? payload.coverUrl         : '',
    titleLower:       typeof payload.titleLower   === 'string'  ? payload.titleLower       : '',
    artistLower:      typeof payload.artistLower  === 'string'  ? payload.artistLower      : '',
    artistId:         payload.artistId    ?? null,
    albumId:          payload.albumId     ?? null,
    trackNumber:      payload.trackNumber != null ? Number(payload.trackNumber) || null : null,
    playCount:        typeof payload.playCount    === 'number'  ? payload.playCount        : 0,
    featured:         typeof payload.featured     === 'boolean' ? payload.featured         : false,
    uploadedBy:       typeof payload.uploadedBy   === 'string'  ? payload.uploadedBy       : '',
    createdAt:        payload.createdAt  ?? null,
    updatedAt:        payload.updatedAt  ?? null,
  };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

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