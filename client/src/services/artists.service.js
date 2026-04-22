/**
 * client/src/services/artists.service.js
 *
 * Phase 2 — Task 2.2: Model Transformation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What changed from Phase 1 version:
 *   - extractArtist() now applies field-level defaults matching Artist.fromFirestore()
 *     on the backend. Both layers agree on the exact Artist shape.
 *   - extractArtistSongs() now runs each song through extractSong() from
 *     songs.service.js so the Song objects within an artist's song list are
 *     also fully normalized.
 *   - All function signatures, export names, and call sites: UNCHANGED.
 *
 * What did NOT change:
 *   - Envelope handling logic in extractArtistSongs: unchanged.
 *   - getArtist, getArtistSongs function signatures: unchanged.
 *   - All console.warn paths: preserved.
 *
 * API contracts consumed:
 *   GET /api/artists/:id        → Artist
 *   GET /api/artists/:id/songs  → { songs: Song[], nextCursor, hasMore }
 */

import api from './api';
import { extractSong } from './songs.service';

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Normalizes a single Artist response payload.
 *
 * Phase 2.2 update: applies field-level defaults so every Artist the frontend
 * receives has a complete, predictable shape.
 * Returns null only for null/undefined/non-object/array inputs.
 *
 * @param {unknown} payload
 * @returns {Artist | null}
 */
export const extractArtist = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[artists.service] extractArtist: unexpected payload', payload);
    return null;
  }

  return {
    id:         typeof payload.id         === 'string'  ? payload.id               : '',
    name:       typeof payload.name       === 'string'  ? payload.name.trim()      : '',
    nameLower:  typeof payload.nameLower  === 'string'  ? payload.nameLower        : '',
    bio:        typeof payload.bio        === 'string'  ? payload.bio              : '',
    imageUrl:   typeof payload.imageUrl   === 'string'  ? payload.imageUrl         : '',
    songCount:  typeof payload.songCount  === 'number'  ? payload.songCount        : 0,
    albumCount: typeof payload.albumCount === 'number'  ? payload.albumCount       : 0,
    verified:   typeof payload.verified   === 'boolean' ? payload.verified         : false,
    createdAt:  payload.createdAt ?? null,
    updatedAt:  payload.updatedAt ?? null,
  };
};

/**
 * Normalizes a paginated artist-songs response into a stable shape.
 * Each song in the list is normalized through extractSong().
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
    return {
      songs:       payload.map(extractSong).filter(Boolean),
      nextCursor:  null,
      hasMore:     false,
    };
  }

  const songs      = Array.isArray(payload.songs)
    ? payload.songs.map(extractSong).filter(Boolean)
    : [];
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