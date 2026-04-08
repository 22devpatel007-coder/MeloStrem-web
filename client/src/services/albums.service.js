/**
 * client/src/services/albums.service.js
 *
 * Frontend service for Album API calls.
 *
 * Follows the exact same pattern as songs.service.js:
 * - extractAlbum / extractAlbumSongs normalizers guard every payload
 * - unwrap() handles Axios response shape
 * - Functions never throw on unexpected shapes — return safe defaults
 *
 * API contracts consumed:
 *   GET /api/albums/:id         → Album
 *   GET /api/albums/:id/songs   → { songs: Song[], albumId: string }
 */

import api from './api';

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Normalizes a single Album response payload.
 * Returns null if the payload is not a usable album object.
 *
 * @param {unknown} payload
 * @returns {Album | null}
 */
export const extractAlbum = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[albums.service] extractAlbum: unexpected payload', payload);
    return null;
  }
  return payload;
};

/**
 * Normalizes an album-songs response.
 * Returns a safe { songs, albumId } object regardless of payload shape.
 *
 * Note: album songs are non-paginated (bounded list, ordered by trackNumber).
 * This differs from artist songs which use cursor pagination.
 *
 * @param {unknown} payload
 * @returns {{ songs: Song[], albumId: string | null }}
 */
export const extractAlbumSongs = (payload) => {
  if (!payload || typeof payload !== 'object') {
    console.warn('[albums.service] extractAlbumSongs: unexpected payload type', typeof payload);
    return { songs: [], albumId: null };
  }

  if (Array.isArray(payload)) {
    console.warn('[albums.service] extractAlbumSongs: received raw array — expected object');
    return { songs: payload, albumId: null };
  }

  const songs   = Array.isArray(payload.songs) ? payload.songs : [];
  const albumId = payload.albumId ?? null;

  if (!Array.isArray(payload.songs)) {
    console.warn('[albums.service] extractAlbumSongs: songs field missing or non-array', payload);
  }

  return { songs, albumId };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────

const unwrap = (res) => res?.data ?? res;

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetches a single Album document by ID.
 * Returns null if the album is not found or payload is unexpected.
 *
 * @param {string} albumId  e.g. "album_artist_arijit-singh_aashiqui-2"
 * @returns {Promise<Album | null>}
 */
export const getAlbum = async (albumId) => {
  const res = await api.get(`/albums/${albumId}`);
  return extractAlbum(unwrap(res));
};

/**
 * Fetches all songs for a given album, ordered by trackNumber ascending.
 * Non-paginated — albums are bounded in size.
 *
 * @param {string} albumId
 * @returns {Promise<{ songs: Song[], albumId: string | null }>}
 */
export const getAlbumSongs = async (albumId) => {
  const res = await api.get(`/albums/${albumId}/songs`);
  return extractAlbumSongs(unwrap(res));
};