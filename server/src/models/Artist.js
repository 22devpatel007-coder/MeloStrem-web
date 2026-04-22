/**
 * server/src/models/Artist.js
 *
 * Phase 2 — Task 2.2: Model Transformation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL Artist data transformation between Firestore and the API layer.
 *
 * Integration contract with BaseRepository:
 *   ArtistRepository calls BaseRepository.formatDoc() which converts Timestamps
 *   to ISO strings. Artist.fromFirestore() receives that plain object and
 *   applies defensive defaults for every field.
 *
 * Field inventory (mirrors ArtistSchema + artist.service.js findOrCreateArtist):
 *   id, name, nameLower, bio, imageUrl, songCount, albumCount, verified,
 *   createdAt, updatedAt
 *
 * ID convention:
 *   artistId is ALWAYS deterministic — computed via computeArtistId(name) in
 *   normalizeEntity.js. Never use Firestore auto-generated IDs for artists.
 *   Example: "Arijit Singh" → "artist_arijit-singh"
 *
 * Merge semantics (preserved from createArtistDefaults):
 *   - bio and imageUrl start as '' on creation.
 *   - Once an admin sets them, set-with-merge on subsequent uploads does NOT
 *     overwrite them. toFirestore() supports a `mergeCreate` flag for this.
 *   - songCount and albumCount are incremented via FieldValue.increment()
 *     in artist.service.js — toFirestore() does NOT set those fields
 *     during merge-create; they are managed separately by the service.
 */

'use strict';

const { FieldValue } = require('firebase-admin/firestore');

class Artist {
  /**
   * fromFirestore(data) → plain Artist object
   *
   * Accepts the plain object from BaseRepository.formatDoc().
   * Never throws — all fields have safe defaults.
   *
   * @param {object} data — plain object from BaseRepository.formatDoc()
   * @returns {object}    — clean, serializable Artist
   */
  static fromFirestore(data) {
    if (!data || typeof data !== 'object') {
      return Artist._empty();
    }

    return {
      id:         typeof data.id         === 'string'  ? data.id                   : '',
      name:       typeof data.name       === 'string'  ? data.name.trim()          : '',
      nameLower:  typeof data.nameLower  === 'string'  ? data.nameLower.trim()     : '',
      bio:        typeof data.bio        === 'string'  ? data.bio                  : '',
      imageUrl:   typeof data.imageUrl   === 'string'  ? data.imageUrl             : '',
      songCount:  typeof data.songCount  === 'number'  ? data.songCount            : 0,
      albumCount: typeof data.albumCount === 'number'  ? data.albumCount           : 0,
      verified:   typeof data.verified   === 'boolean' ? data.verified             : false,

      // Timestamps — already ISO strings from BaseRepository.formatDoc()
      createdAt:  data.createdAt ?? null,
      updatedAt:  data.updatedAt ?? null,
    };
  }

  /**
   * toFirestore(data, mode) → object ready to write to Firestore
   *
   * mode = 'create'      : full document write (new artist, first upload)
   * mode = 'mergeCreate' : set-with-merge payload (findOrCreateArtist pattern).
   *                        Omits songCount/albumCount/bio/imageUrl so existing
   *                        values are not overwritten on subsequent uploads.
   * mode = 'update'      : partial update (admin edits bio/imageUrl).
   *                        Only includes fields present in data.
   *
   * Note: songCount and albumCount increments are handled by artist.service.js
   * using FieldValue.increment() — they are intentionally absent from
   * 'mergeCreate' and 'update' modes here.
   *
   * @param {object} data
   * @param {'create'|'mergeCreate'|'update'} [mode='create']
   * @returns {object}
   */
  static toFirestore(data, mode = 'create') {
    const name = typeof data.name === 'string' ? data.name.trim() : '';

    if (mode === 'update') {
      // Partial update — only include fields explicitly passed
      const payload = { updatedAt: FieldValue.serverTimestamp() };
      if (data.name      !== undefined) { payload.name      = name; payload.nameLower = name.toLowerCase(); }
      if (data.bio       !== undefined)   payload.bio       = String(data.bio).trim();
      if (data.imageUrl  !== undefined)   payload.imageUrl  = String(data.imageUrl).trim();
      if (data.verified  !== undefined)   payload.verified  = Boolean(data.verified);
      return payload;
    }

    if (mode === 'mergeCreate') {
      // set-with-merge: only write fields that should be set on first creation.
      // bio, imageUrl, songCount, albumCount are excluded so existing admin
      // edits and service-managed counters are never overwritten.
      return {
        id:        data.id || '',
        name:      name,
        nameLower: name.toLowerCase(),
        verified:  false,
        createdAt: data.createdAt instanceof Date
          ? data.createdAt
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      };
    }

    // mode === 'create' — full document (used by tests and direct service creation)
    return {
      id:         data.id || '',
      name:       name,
      nameLower:  name.toLowerCase(),
      bio:        typeof data.bio       === 'string'  ? data.bio.trim()   : '',
      imageUrl:   typeof data.imageUrl  === 'string'  ? data.imageUrl     : '',
      songCount:  typeof data.songCount === 'number'  ? data.songCount    : 0,
      albumCount: typeof data.albumCount === 'number' ? data.albumCount   : 0,
      verified:   typeof data.verified  === 'boolean' ? data.verified     : false,
      createdAt:  data.createdAt instanceof Date
        ? data.createdAt
        : FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    };
  }

  /** @private */
  static _empty() {
    return {
      id: '', name: '', nameLower: '', bio: '', imageUrl: '',
      songCount: 0, albumCount: 0, verified: false,
      createdAt: null, updatedAt: null,
    };
  }
}

// ── Legacy exports — backward compatibility ────────────────────────────────────
// Existing imports of { ArtistSchema, createArtistDefaults } continue to work.

const ArtistSchema = {
  id:         'string',
  name:       'string',
  nameLower:  'string',
  bio:        'string',
  imageUrl:   'string',
  songCount:  'number',
  albumCount: 'number',
  verified:   'boolean',
  createdAt:  'timestamp',
  updatedAt:  'timestamp',
};

function createArtistDefaults(name, artistId) {
  const now = new Date();
  return {
    id:         artistId,
    name:       name.trim(),
    nameLower:  name.trim().toLowerCase(),
    bio:        '',
    imageUrl:   '',
    songCount:  0,
    albumCount: 0,
    verified:   false,
    createdAt:  now,
    updatedAt:  now,
  };
}

module.exports = { Artist, ArtistSchema, createArtistDefaults };