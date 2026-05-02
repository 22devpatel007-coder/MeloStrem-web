/**
 * server/src/repositories/ArtistRepository.js
 *
 * Phase 2 — Task 2.1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All Firestore access for the artists collection.
 * Extends BaseRepository — every call goes through the circuit breaker
 * and retryFirestore automatically.
 *
 * Methods:
 *   findById(id)                         — fetch artist by deterministic ID
 *   findOrCreate(name, artistId, defaults) — upsert artist (set-with-merge)
 *   incrementSongCount(artistId)          — atomic increment songCount
 *   incrementAlbumCount(artistId)         — atomic increment albumCount
 *   update(id, data)                      — partial update artist document
 *
 * Artist ID convention:
 *   artistId is ALWAYS deterministic — computed via computeArtistId(name)
 *   in normalizeEntity.js. Never use Firestore auto-generated IDs.
 *   Example: "artist_arijit-singh"
 *
 * Firestore indexes required:
 *   artists: nameLower ASC  — for future admin artist search
 *
 * FieldValue.increment() is used for songCount and albumCount to ensure
 * concurrent upload operations don't race on counter values.
 */

'use strict';
const { Artist } = require('../models/Artist');
const admin = require('firebase-admin');
const BaseRepository = require('./BaseRepository');

const FieldValue = admin.firestore.FieldValue;

class ArtistRepository extends BaseRepository {
  /**
   * @param {FirebaseFirestore.Firestore} db
   */
  constructor(db) {
    super(db, 'artists');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * findById(id) → object | null
   *
   * @param {string} id — deterministic artist ID (e.g. "artist_arijit-singh")
   * @returns {Promise<object | null>}
   */
  async findById(id) {
   const raw = await super.findById(id);
    return raw ? Artist.fromFirestore(raw) : null;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * findOrCreate(artistId, defaults) → object
   *
   * Set-with-merge: creates the artist document if it doesn't exist.
   * If it already exists, the merge preserves existing fields
   * (bio, imageUrl, verified) that may have been set by an admin.
   *
   * songCount and albumCount are NOT in defaults — they are incremented
   * separately via incrementSongCount / incrementAlbumCount using
   * FieldValue.increment() for concurrency safety.
   *
   * @param {string} artistId  — deterministic document ID
   * @param {object} defaults  — createArtistDefaults() output (see Artist.js)
   * @returns {Promise<object>}
   */
  async findOrCreate(artistId, defaults) {
    return this._callFirestore(async () => {
      const ref = this._db.collection('artists').doc(artistId);

      // set-with-merge: only writes fields that don't already exist in the doc
      await ref.set(
        { ...defaults, updatedAt: new Date() },
        { merge: true },
      );

      const snap = await ref.get();
      return Artist.fromFirestore(this.formatDoc(snap));
    }, `findOrCreate(${artistId})`);
  }

  /**
   * incrementSongCount(artistId) → void
   *
   * Atomically increments the artist's songCount by 1.
   * Called after a song is successfully linked to this artist.
   * Fire-and-forget — does not block the song upload response.
   *
   * @param {string} artistId
   * @returns {Promise<void>}
   */
  async incrementSongCount(artistId) {
    return this._callFirestore(async () => {
      await this._db.collection('artists').doc(artistId).update({
        songCount:  FieldValue.increment(1),
        updatedAt:  new Date(),
      });
    }, `incrementSongCount(${artistId})`);
  }

  /**
   * incrementAlbumCount(artistId) → void
   *
   * Atomically increments the artist's albumCount by 1.
   * Called when a new album is linked to this artist for the first time.
   * Fire-and-forget — does not block the song upload response.
   *
   * @param {string} artistId
   * @returns {Promise<void>}
   */
  async incrementAlbumCount(artistId) {
    return this._callFirestore(async () => {
      await this._db.collection('artists').doc(artistId).update({
        albumCount: FieldValue.increment(1),
        updatedAt:  new Date(),
      });
    }, `incrementAlbumCount(${artistId})`);
  }

  /**
   * update(id, data) → object
   *
   * Partial update for an existing artist document.
   * Used by admin to set bio, imageUrl, verified.
   *
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async update(id, data) {
    return super.update(id, data);
  }
}

module.exports = ArtistRepository;