/**
 * client/src/services/albums.service.js
 *
 * Phase 2 — Task 2.2: Model Transformation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * What changed from Phase 1 version:
 *   - extractAlbum() now applies field-level defaults matching Album.fromFirestore()
 *     on the backend. Both layers agree on the exact Album shape.
 *   - extractAlbumSongs() now runs each song through extractSong() from
 *     songs.service.js so the Song objects within an album's song list are
 *     also fully normalized.
 *   - All function signatures, export names, and call sites: UNCHANGED.
 *
 * What did NOT change:
 *   - Envelope handling logic in extractAlbumSongs: unchanged.
 *   - getAlbum, getAlbumSongs function signatures: unchanged.
 *   - All console.warn paths: preserved.
 *
 * API contracts consumed:
 *   GET /api/albums/:id         → Album
 *   GET /api/albums/:id/songs   → { songs: Song[], albumId: string }
 */

import api from './api';
import { extractSong } from './songs.service';

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Normalizes a single Album response payload.
 *
 * Phase 2.2 update: applies field-level defaults so every Album the frontend
 * receives has a complete, predictable shape.
 * Returns null only for null/undefined/non-object/array inputs.
 *
 * @param {unknown} payload
 * @returns {Album | null}
 */
export const extractAlbum = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[albums.service] extractAlbum: unexpected payload', payload);
    return null;
  }

  return {
    id:         typeof payload.id         === 'string' ? payload.id               : '',
    name:       typeof payload.name       === 'string' ? payload.name.trim()      : '',
    nameLower:  typeof payload.nameLower  === 'string' ? payload.nameLower        : '',
    artistId:   typeof payload.artistId   === 'string' ? payload.artistId         : '',
    artistName: typeof payload.artistName === 'string' ? payload.artistName.trim(): '',
    coverUrl:   typeof payload.coverUrl   === 'string' ? payload.coverUrl         : '',
    genre:      typeof payload.genre      === 'string' ? payload.genre.trim()     : '',
    year:       typeof payload.year       === 'number' ? payload.year             : 0,
    songCount:  typeof payload.songCount  === 'number' ? payload.songCount        : 0,
    createdAt:  payload.createdAt ?? null,
    updatedAt:  payload.updatedAt ?? null,
  };
};

/**
 * Normalizes an album-songs response.
 * Each song in the list is normalized through extractSong().
 *
 * Note: album songs are non-paginated (bounded list, ordered by trackNumber).
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
    return { songs: payload.map(extractSong).filter(Boolean), albumId: null };
  }

  const songs   = Array.isArray(payload.songs)
    ? payload.songs.map(extractSong).filter(Boolean)
    : [];
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