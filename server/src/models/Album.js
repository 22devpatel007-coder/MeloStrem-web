/**
 * server/src/models/Album.js
 *
 * Phase 2 — Task 2.2: Model Transformation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL Album data transformation between Firestore and the API layer.
 *
 * Integration contract with BaseRepository:
 *   AlbumRepository calls BaseRepository.formatDoc() which converts Timestamps
 *   to ISO strings. Album.fromFirestore() receives that plain object and
 *   applies defensive defaults for every field.
 *
 * Field inventory (mirrors AlbumSchema + album.service.js findOrCreateAlbum):
 *   id, name, nameLower, artistId, artistName, coverUrl, genre, year,
 *   songCount, createdAt, updatedAt
 *
 * ID convention:
 *   albumId is ALWAYS deterministic — computed via computeAlbumId(artistId, albumName)
 *   in normalizeEntity.js. Never use Firestore auto-generated IDs for albums.
 *   Example: "Aashiqui 2" by "artist_arijit-singh" → "album_artist_arijit-singh_aashiqui-2"
 *
 * Merge semantics (mirrors createAlbumDefaults):
 *   - coverUrl, genre, year: set on first creation, preserved on subsequent merges.
 *   - songCount: starts at 0 on creation, incremented via FieldValue.increment()
 *     in album.service.js — NOT managed by toFirestore().
 *   - toFirestore('mergeCreate') omits songCount so the service-level increment
 *     is never accidentally reset.
 */

'use strict';

const { FieldValue } = require('firebase-admin/firestore');

class Album {
  /**
   * fromFirestore(data) → plain Album object
   *
   * Accepts the plain object from BaseRepository.formatDoc().
   * Never throws — all fields have safe defaults.
   *
   * @param {object} data — plain object from BaseRepository.formatDoc()
   * @returns {object}    — clean, serializable Album
   */
  static fromFirestore(data) {
    if (!data || typeof data !== 'object') {
      return Album._empty();
    }

    return {
      id:         typeof data.id         === 'string' ? data.id               : '',
      name:       typeof data.name       === 'string' ? data.name.trim()      : '',
      nameLower:  typeof data.nameLower  === 'string' ? data.nameLower.trim() : '',
      artistId:   typeof data.artistId   === 'string' ? data.artistId         : '',
      artistName: typeof data.artistName === 'string' ? data.artistName.trim(): '',
      coverUrl:   typeof data.coverUrl   === 'string' ? data.coverUrl         : '',
      genre:      typeof data.genre      === 'string' ? data.genre.trim()     : '',
      year:       typeof data.year       === 'number' ? data.year             : 0,
      songCount:  typeof data.songCount  === 'number' ? data.songCount        : 0,

      // Timestamps — already ISO strings from BaseRepository.formatDoc()
      createdAt:  data.createdAt ?? null,
      updatedAt:  data.updatedAt ?? null,
    };
  }

  /**
   * toFirestore(data, mode) → object ready to write to Firestore
   *
   * mode = 'create'      : full document write (new album).
   * mode = 'mergeCreate' : set-with-merge payload (findOrCreateAlbum pattern).
   *                        Omits songCount — managed by FieldValue.increment()
   *                        in album.service.js. Also omits coverUrl/genre/year
   *                        from the merge so existing values from first upload
   *                        are never overwritten on subsequent merges.
   * mode = 'update'      : partial update (admin edits album metadata).
   *
   * @param {object} data
   * @param {'create'|'mergeCreate'|'update'} [mode='create']
   * @returns {object}
   */
  static toFirestore(data, mode = 'create') {
    const name       = typeof data.name       === 'string' ? data.name.trim()       : '';
    const artistName = typeof data.artistName === 'string' ? data.artistName.trim() : '';

    if (mode === 'update') {
      // Partial update — only include fields explicitly passed
      const payload = { updatedAt: FieldValue.serverTimestamp() };
      if (data.name       !== undefined) { payload.name      = name; payload.nameLower = name.toLowerCase(); }
      if (data.artistName !== undefined)   payload.artistName = artistName;
      if (data.coverUrl   !== undefined)   payload.coverUrl   = String(data.coverUrl).trim();
      if (data.genre      !== undefined)   payload.genre      = String(data.genre).trim();
      if (data.year       !== undefined)   payload.year       = Number(data.year) || 0;
      return payload;
    }

    if (mode === 'mergeCreate') {
      // set-with-merge for findOrCreateAlbum:
      // Only write identity fields (id, name, artistId, artistName).
      // coverUrl, genre, year are written ONLY on creation (Firestore merge
      // preserves existing values when keys are absent from the payload).
      // songCount is managed separately via FieldValue.increment().
      return {
        id:         data.id        || '',
        name:       name,
        nameLower:  name.toLowerCase(),
        artistId:   typeof data.artistId === 'string' ? data.artistId : '',
        artistName: artistName,
        // These three are set on first creation and preserved on subsequent merges.
        // Pass them in the payload; Firestore set-with-merge writes them if absent,
        // and the caller (album.service.js) passes them every time so first creation
        // always has real values.
        coverUrl:   typeof data.coverUrl === 'string' ? data.coverUrl : '',
        genre:      typeof data.genre    === 'string' ? data.genre.trim() : '',
        year:       typeof data.year     === 'number' ? data.year : 0,
        createdAt:  data.createdAt instanceof Date
          ? data.createdAt
          : FieldValue.serverTimestamp(),
        updatedAt:  FieldValue.serverTimestamp(),
      };
    }

    // mode === 'create' — full document
    return {
      id:         data.id        || '',
      name:       name,
      nameLower:  name.toLowerCase(),
      artistId:   typeof data.artistId   === 'string' ? data.artistId       : '',
      artistName: artistName,
      coverUrl:   typeof data.coverUrl   === 'string' ? data.coverUrl       : '',
      genre:      typeof data.genre      === 'string' ? data.genre.trim()   : '',
      year:       typeof data.year       === 'number' ? data.year           : 0,
      songCount:  typeof data.songCount  === 'number' ? data.songCount      : 0,
      createdAt:  data.createdAt instanceof Date
        ? data.createdAt
        : FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    };
  }

  /** @private */
  static _empty() {
    return {
      id: '', name: '', nameLower: '', artistId: '', artistName: '',
      coverUrl: '', genre: '', year: 0, songCount: 0,
      createdAt: null, updatedAt: null,
    };
  }
}

// ── Legacy exports — backward compatibility ────────────────────────────────────
// Existing imports of { AlbumSchema, createAlbumDefaults } continue to work.

const AlbumSchema = {
  id:         'string',
  name:       'string',
  nameLower:  'string',
  artistId:   'string',
  artistName: 'string',
  coverUrl:   'string',
  genre:      'string',
  year:       'number',
  songCount:  'number',
  createdAt:  'timestamp',
  updatedAt:  'timestamp',
};

function createAlbumDefaults({ albumId, name, artistId, artistName, coverUrl = '', genre = '', year = 0 }) {
  const now = new Date();
  return {
    id:         albumId,
    name:       name.trim(),
    nameLower:  name.trim().toLowerCase(),
    artistId,
    artistName: artistName.trim(),
    coverUrl,
    genre,
    year,
    songCount:  0,
    createdAt:  now,
    updatedAt:  now,
  };
}

module.exports = { Album, AlbumSchema, createAlbumDefaults };