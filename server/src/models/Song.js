/**
 * server/src/models/Song.js
 *
 * Phase 2 — Task 2.2: Model Transformation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL Song data transformation between Firestore and the API response layer.
 *
 * Why this exists:
 *   Before Phase 2.2, normalization was scattered across:
 *     - songs.controller.js  (manual spread + toDate() calls)
 *     - getSongsBatch        (inline snap.data() spread)
 *     - client/songs.service.js  (extractSong / extractSongs)
 *   Any new Firestore field required updates in 3+ places. This class is the
 *   single source of truth for what a Song looks like at every layer boundary.
 *
 * Integration contract with BaseRepository:
 *   BaseRepository.formatDoc() converts Firestore Timestamps to ISO strings and
 *   spreads snap.data() into a plain object. Song.fromFirestore() receives THAT
 *   plain object — it does NOT receive a raw DocumentSnapshot. This is correct
 *   and intentional: the repository layer handles Firestore-specific types,
 *   the model layer handles shape normalization and defensive defaults.
 *
 * Field inventory (mirrors SongSchema + controller writes):
 *   Core metadata  : id, title, artist, genre, album, duration
 *   Search fields  : titleLower, artistLower
 *   Media URLs     : audioUrl (alias: fileUrl), coverUrl
 *   Storage refs   : storagePath, coverStoragePath
 *   Artist/Album   : artistId, albumId, trackNumber
 *   Counters       : playCount
 *   Flags          : featured
 *   Auth           : uploadedBy
 *   Timestamps     : createdAt, updatedAt
 *
 * IMPORTANT — fileUrl vs audioUrl:
 *   The controller writes `fileUrl` to Firestore (from Cloudinary secure_url).
 *   The frontend reads `audioUrl`. Both fields are preserved in fromFirestore()
 *   so neither old documents nor new ones break. toFirestore() writes `fileUrl`
 *   (matching the controller convention) and also includes `audioUrl` as an alias
 *   so direct reads from SongRepository always have both keys available.
 */

'use strict';

const { FieldValue } = require('firebase-admin/firestore');

class Song {
  /**
   * fromFirestore(data) → plain Song object
   *
   * Accepts the plain object that BaseRepository.formatDoc() produces.
   * Timestamps are already ISO strings at this point.
   * All fields have defensive defaults — this method never throws.
   *
   * @param {object} data — plain object from BaseRepository.formatDoc()
   * @returns {object}    — clean, serializable Song
   */
  static fromFirestore(data) {
    if (!data || typeof data !== 'object') {
      return Song._empty();
    }

    // fileUrl is what the controller writes; audioUrl is what the frontend reads.
    // Support both so legacy documents and new documents both work.
    const resolvedAudioUrl = data.fileUrl || data.audioUrl || '';

    return {
      id:               typeof data.id === 'string'    ? data.id               : '',
      title:            typeof data.title === 'string' ? data.title.trim()     : '',
      artist:           typeof data.artist === 'string'? data.artist.trim()    : '',

tags:             Array.isArray(data.tags) ? data.tags.map(String) : [],
      album:            typeof data.album === 'string' ? data.album.trim()     : '',
      duration:         typeof data.duration === 'number' ? data.duration      : 0,

      // Media — expose as audioUrl to the API layer (frontend contract)
      audioUrl:         resolvedAudioUrl,
      fileUrl:          resolvedAudioUrl,          // preserve original field for compatibility
      coverUrl:         typeof data.coverUrl === 'string' ? data.coverUrl      : '',

      // Cloudinary storage references (admin-only, not needed by client but
      // preserved so deleteSong can still call deleteAsset correctly)
      storagePath:      typeof data.storagePath === 'string'      ? data.storagePath      : '',
      coverStoragePath: typeof data.coverStoragePath === 'string' ? data.coverStoragePath : '',

      // Search-optimized lowercase fields
      titleLower:       typeof data.titleLower === 'string'  ? data.titleLower  : '',
      artistLower:      typeof data.artistLower === 'string' ? data.artistLower : '',

      // Artist / Album linking (nullable — backfill may not be complete)
      artistId:         data.artistId    ?? null,
      albumId:          data.albumId     ?? null,
      trackNumber:      data.trackNumber != null ? Number(data.trackNumber) || null : null,

      // Counters and flags
      playCount:        typeof data.playCount === 'number' ? data.playCount     : 0,
      featured:         typeof data.featured === 'boolean' ? data.featured      : false,

      // Auth
      uploadedBy:       typeof data.uploadedBy === 'string' ? data.uploadedBy   : '',

      // Timestamps — already ISO strings from BaseRepository.formatDoc()
      createdAt:        data.createdAt ?? null,
      updatedAt:        data.updatedAt ?? null,
    };
  }

  /**
   * toFirestore(data) → object ready to write to Firestore
   *
   * Accepts a plain data object (from a controller or service) and returns
   * the exact shape to write to Firestore. Does NOT include `id` — Firestore
   * document IDs are managed by the repository layer, not the data payload.
   *
   * Called by SongRepository.create() and SongRepository.update().
   * The controller still builds the payload; toFirestore() validates and
   * normalizes it before the repository writes it.
   *
   * Timestamps:
   *   - On CREATE: pass createdAt/updatedAt as `new Date()` or omit to auto-set.
   *   - On UPDATE: pass updatedAt as `new Date()` — createdAt is never touched.
   *   - FieldValue.serverTimestamp() is also accepted and passed through.
   *
   * @param {object} data
   * @param {'create'|'update'} [mode='create']
   * @returns {object}
   */
  static toFirestore(data, mode = 'create') {
    const title  = typeof data.title  === 'string' ? data.title.trim()  : '';
    const artist = typeof data.artist === 'string' ? data.artist.trim() : '';

    const payload = {
      title,
      artist,
      // NEW
tags:  Array.isArray(data.tags) ? data.tags.slice(0, 10).map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
      album:            typeof data.album  === 'string' ? data.album.trim()  : '',
      duration:         typeof data.duration === 'number' ? data.duration    : Number(data.duration) || 0,

      // Always write fileUrl (Cloudinary public_id convention in this project)
      fileUrl:          data.fileUrl || data.audioUrl || '',
      coverUrl:         typeof data.coverUrl === 'string' ? data.coverUrl    : '',

      storagePath:      typeof data.storagePath      === 'string' ? data.storagePath      : '',
      coverStoragePath: typeof data.coverStoragePath === 'string' ? data.coverStoragePath : '',

      // Keep search fields in sync — always derive from current title/artist
      titleLower:       title.toLowerCase(),
      artistLower:      artist.toLowerCase(),

      artistId:         data.artistId    ?? null,
      albumId:          data.albumId     ?? null,
      trackNumber:      data.trackNumber != null ? Number(data.trackNumber) || null : null,

      playCount:        typeof data.playCount === 'number' ? data.playCount  : 0,
      featured:         typeof data.featured  === 'boolean' ? data.featured  : false,
      uploadedBy:       typeof data.uploadedBy === 'string' ? data.uploadedBy : '',

      updatedAt:        data.updatedAt instanceof Date
        ? data.updatedAt
        : FieldValue.serverTimestamp(),
    };

    // createdAt is only set on CREATE — never overwrite on UPDATE
    if (mode === 'create') {
      payload.createdAt = data.createdAt instanceof Date
        ? data.createdAt
        : FieldValue.serverTimestamp();
    }

    return payload;
  }

  /**
   * _empty() → safe empty Song
   * Used when fromFirestore receives null/undefined/non-object input.
   * @private
   */
  static _empty() {
    return {
      id: '', title: '', artist: '', tags: [], album: '',
      duration: 0, audioUrl: '', fileUrl: '', coverUrl: '',
      storagePath: '', coverStoragePath: '',
      titleLower: '', artistLower: '',
      artistId: null, albumId: null, trackNumber: null,
      playCount: 0, featured: false, uploadedBy: '',
      createdAt: null, updatedAt: null,
    };
  }
}

// ── Legacy schema exports — preserved for backward compatibility ──────────────
// Existing code that imports { SongSchema, createSongDefaults } from Song.js
// continues to work without any changes at the import sites.

const SongSchema = {
  id:          'string',
  title:       'string',
  artist:      'string',
  album:       'string',
  tags:        'string[]',
  duration:    'number',
  audioUrl:    'string',   // exposed to API layer (alias of fileUrl)
  fileUrl:     'string',   // stored in Firestore
  coverUrl:    'string',
  titleLower:  'string',
  artistLower: 'string',
  createdAt:   'timestamp',
  uploadedBy:  'string',
  featured:    'boolean',
  artistId:    'string|null',
  albumId:     'string|null',
  trackNumber: 'number|null',
  playCount:   'number',
  storagePath: 'string',
  coverStoragePath: 'string',
};

const createSongDefaults = () => ({
  album:            '',
  tags:             [],
  duration:         0,
  coverUrl:         '',
  titleLower:       '',
  artistLower:      '',
  createdAt:        new Date(),
  uploadedBy:       '',
  featured:         false,
  playCount:        0,
  artistId:         null,
  albumId:          null,
  trackNumber:      null,
  storagePath:      '',
  coverStoragePath: '',
});

module.exports = { Song, SongSchema, createSongDefaults };