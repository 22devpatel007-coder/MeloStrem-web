/**
 * client/src/services/artists.service.js
 *
 * Frontend service for Artist API calls.
 *
 * Follows the exact same pattern as songs.service.js:
 * - extractArtist / extractArtistSongs normalizers guard every payload
 * - unwrap() handles Axios response shape
 * - Functions never throw on unexpected shapes — return safe defaults
 *
 * API contracts consumed:
 *   GET /api/artists/:id        → Artist
 *   GET /api/artists/:id/songs  → { songs: Song[], nextCursor, hasMore }
 */

import api from './api';

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Normalizes a single Artist response payload.
 * Returns null if the payload is not a usable artist object.
 *
 * @param {unknown} payload
 * @returns {Artist | null}
 */
export const extractArtist = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[artists.service] extractArtist: unexpected payload', payload);
    return null;
  }
  return payload;
};

/**
 * Normalizes a paginated artist-songs response into a stable shape.
 * Uses the same { songs, nextCursor, hasMore } contract as songs.service.
 *
 * @param {unknown} payload
 * @returns {{ songs: Song[], nextCursor: string | null, hasMore: boolean }}
 */
export const extractArtistSongs = (payload) => {
  if (!payload || typeof payload !== 'object') {
    console.warn('[artists.service] extractArtistSongs: unexpected payload type', typeof payload);
    return { songs: [], nextCursor: null, hasMore: false };
  }

  if (Array.isArray(payload)) {
    console.warn('[artists.service] extractArtistSongs: received raw array — expected object');
    return { songs: payload, nextCursor: null, hasMore: false };
  }

  const songs      = Array.isArray(payload.songs) ? payload.songs : [];
  const nextCursor = payload.nextCursor ?? null;
  const hasMore    = typeof payload.hasMore === 'boolean' ? payload.hasMore : false;

  if (!Array.isArray(payload.songs)) {
    console.warn('[artists.service] extractArtistSongs: songs field missing or non-array', payload);
  }

  return { songs, nextCursor, hasMore };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

const unwrap = (res) => res?.data ?? res;

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetches a single Artist document by ID.
 * Returns null if the artist is not found or payload is unexpected.
 *
 * @param {string} artistId  e.g. "artist_arijit-singh"
 * @returns {Promise<Artist | null>}
 */
export const getArtist = async (artistId) => {
  const res = await api.get(`/artists/${artistId}`);
  return extractArtist(unwrap(res));
};

/**
 * Fetches a paginated page of songs for a given artist.
 * Always returns a normalized { songs, nextCursor, hasMore } object.
 *
 * @param {string} artistId
 * @param {number} limit
 * @param {string | null} cursor
 * @returns {Promise<{ songs: Song[], nextCursor: string | null, hasMore: boolean }>}
 */
export const getArtistSongs = async (artistId, limit = 30, cursor = null) => {
  const params = { limit };
  if (cursor) params.cursor = cursor;
  const res = await api.get(`/artists/${artistId}/songs`, { params });
  return extractArtistSongs(unwrap(res));
};