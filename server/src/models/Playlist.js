/**
 * server/src/models/Playlist.js
 *
 * Phase 2 — Task 2.2: Model Transformation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL Playlist data transformation between Firestore and the API layer.
 *
 * Integration contract with BaseRepository:
 *   PlaylistRepository calls BaseRepository.formatDoc() which converts
 *   Timestamps to ISO strings. Playlist.fromFirestore() receives that plain
 *   object and applies defensive defaults for every field.
 *
 * Field inventory (mirrors PlaylistSchema):
 *   id, name, description, coverUrl, songs (array of songIds),
 *   createdBy, isPublic, createdAt, updatedAt
 *
 * songs field:
 *   Stored as an array of song document IDs (strings).
 *   The full Song objects are resolved separately via POST /api/songs/batch
 *   (PlaylistService → SongRepository.batchGet). They are NOT embedded here.
 *   fromFirestore() always returns songs as a clean string[] with no nulls.
 *
 * Admin vs user playlists:
 *   Both live in the same 'playlists' collection.
 *   isPublic=true → visible at GET /api/playlists/admin (public listing).
 *   isPublic=false → visible only to the owning user at GET /api/users/:uid/playlists.
 */

'use strict';

const { FieldValue } = require('firebase-admin/firestore');

class Playlist {
  /**
   * fromFirestore(data) → plain Playlist object
   *
   * Accepts the plain object from BaseRepository.formatDoc().
   * Never throws — all fields have safe defaults.
   *
   * @param {object} data — plain object from BaseRepository.formatDoc()
   * @returns {object}    — clean, serializable Playlist
   */
  static fromFirestore(data) {
    if (!data || typeof data !== 'object') {
      return Playlist._empty();
    }

    // songs must be a clean string[] — filter out any nulls/non-strings
    // that could have been written by buggy code paths.
    const songs = Array.isArray(data.songIds)
  ? data.songIds.filter((s) => typeof s === 'string' && s.trim() !== '')
  : [];

    return {
      id:          typeof data.id          === 'string'  ? data.id               : '',
      name:        typeof data.name        === 'string'  ? data.name.trim()      : '',
      description: typeof data.description === 'string'  ? data.description      : '',
      coverUrl:    typeof data.coverUrl    === 'string'  ? data.coverUrl         : '',
      songIds: songs,
      createdBy:   typeof data.createdBy   === 'string'  ? data.createdBy        : '',
      isPublic:    typeof data.isPublic    === 'boolean' ? data.isPublic         : false,

      // Timestamps — already ISO strings from BaseRepository.formatDoc()
      createdAt:   data.createdAt ?? null,
      updatedAt:   data.updatedAt ?? null,
    };
  }

  /**
   * toFirestore(data, mode) → object ready to write to Firestore
   *
   * mode = 'create' : full document write (new playlist).
   * mode = 'update' : partial update — only include fields in data.
   *
   * songs field:
   *   On create: starts as [] or whatever the caller provides.
   *   On update: if data.songs is present, clean it the same way fromFirestore
   *   does (filter non-strings). Song array mutations (add/remove) are handled
   *   by PlaylistService using FieldValue.arrayUnion / FieldValue.arrayRemove —
   *   those are NOT handled here; they bypass toFirestore() intentionally.
   *
   * @param {object} data
   * @param {'create'|'update'} [mode='create']
   * @returns {object}
   */
  static toFirestore(data, mode = 'create') {
    if (mode === 'update') {
      const payload = { updatedAt: FieldValue.serverTimestamp() };
      if (data.name        !== undefined) payload.name        = String(data.name).trim();
      if (data.description !== undefined) payload.description = String(data.description);
      if (data.coverUrl    !== undefined) payload.coverUrl    = String(data.coverUrl).trim();
      if (data.isPublic    !== undefined) payload.isPublic    = Boolean(data.isPublic);
      if (data.songIds !== undefined && Array.isArray(data.songIds)) {
  payload.songIds = data.songIds.filter((s) => typeof s === 'string' && s.trim() !== '');
}
      return payload;
    }

    // mode === 'create'
    const songs = Array.isArray(data.songs)
      ? data.songs.filter((s) => typeof s === 'string' && s.trim() !== '')
      : [];

    return {
      name:        typeof data.name        === 'string'  ? data.name.trim()      : '',
      description: typeof data.description === 'string'  ? data.description      : '',
      coverUrl:    typeof data.coverUrl    === 'string'  ? data.coverUrl         : '',
     songIds: songs,
      createdBy:   typeof data.createdBy   === 'string'  ? data.createdBy        : '',
      isPublic:    typeof data.isPublic    === 'boolean' ? data.isPublic         : false,
      createdAt:   data.createdAt instanceof Date
        ? data.createdAt
        : FieldValue.serverTimestamp(),
      updatedAt:   FieldValue.serverTimestamp(),
    };
  }

  /** @private */
  static _empty() {
    return {
      id: '', name: '', description: '', coverUrl: '',
      songs: [], createdBy: '', isPublic: false,
      createdAt: null, updatedAt: null,
    };
  }
}

// ── Legacy exports — backward compatibility ────────────────────────────────────
// Existing imports of { PlaylistSchema, createPlaylistDefaults } continue to work.

const PlaylistSchema = {
  id:          'string',
  name:        'string',
  description: 'string',
  coverUrl:    'string',
  songs:       'array',
  createdBy:   'string',
  isPublic:    'boolean',
  createdAt:   'timestamp',
  updatedAt:   'timestamp',
};

const createPlaylistDefaults = () => ({
  description: '',
  coverUrl:    '',
  songs:       [],
  isPublic:    false,
  createdAt:   new Date(),
  updatedAt:   new Date(),
});

module.exports = { Playlist, PlaylistSchema, createPlaylistDefaults };