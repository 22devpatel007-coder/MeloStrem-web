/**
 * server/src/repositories/AlbumRepository.js
 *
 * Phase 2 — Task 2.1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All Firestore access for the albums collection.
 * Extends BaseRepository — every call goes through the circuit breaker
 * and retryFirestore automatically.
 *
 * Methods:
 *   findById(id)                          — fetch album by deterministic ID
 *   findOrCreate(albumId, defaults)       — upsert album (set-with-merge)
 *   incrementSongCount(albumId)           — atomic increment songCount
 *   update(id, data)                      — partial update album document
 *
 * Album ID convention:
 *   albumId is ALWAYS deterministic — computed via computeAlbumId(artistId, albumName)
 *   in normalizeEntity.js. Never use Firestore auto-generated IDs for albums.
 *   Example: "album_artist_arijit-singh_aashiqui-2"
 *
 * Design notes:
 *   - coverUrl, genre, year are set on first creation and preserved on merge.
 *     Subsequent uploads to the same album do NOT overwrite these fields
 *     because set-with-merge only writes missing fields.
 *   - songCount is incremented via FieldValue.increment() for concurrency safety.
 *
 * Firestore indexes required:
 *   albums: artistId + nameLower  — for future artist → albums listing
 */

'use strict';
const { Album } = require('../models/Album');
const admin = require('firebase-admin')   
const BaseRepository = require('./BaseRepository');

const FieldValue = admin.firestore.FieldValue;

class AlbumRepository extends BaseRepository {
  /**
   * @param {FirebaseFirestore.Firestore} db
   */
  constructor(db) {
    super(db, 'albums');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * findById(id) → object | null
   *
   * @param {string} id — deterministic album ID
   *                      (e.g. "album_artist_arijit-singh_aashiqui-2")
   * @returns {Promise<object | null>}
   */
  async findById(id) {
    const raw = await super.findById(id);
    return raw ? Album.fromFirestore(raw) : null;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * findOrCreate(albumId, defaults) → object
   *
   * Set-with-merge: creates the album document if it doesn't exist.
   * If it already exists, existing fields (coverUrl, genre, year) are
   * preserved because set-with-merge only writes absent fields.
   *
   * songCount is NOT in defaults — it is incremented separately via
   * incrementSongCount() using FieldValue.increment() for concurrency safety.
   *
   * @param {string} albumId   — deterministic document ID
   * @param {object} defaults  — createAlbumDefaults() output (see Album.js)
   * @returns {Promise<object>}
   */
  async findOrCreate(albumId, defaults) {
    return this._callFirestore(async () => {
      const ref = this._db.collection('albums').doc(albumId);

      await ref.set(
        { ...defaults, updatedAt: new Date() },
        { merge: true },
      );

      const snap = await ref.get();
      return Album.fromFirestore(this.formatDoc(snap));
    }, `findOrCreate(${albumId})`);
  }

  /**
   * incrementSongCount(albumId) → void
   *
   * Atomically increments the album's songCount by 1.
   * Called after a song is successfully linked to this album.
   * Fire-and-forget — does not block the song upload response.
   *
   * @param {string} albumId
   * @returns {Promise<void>}
   */
  async incrementSongCount(albumId) {
    return this._callFirestore(async () => {
      await this._db.collection('albums').doc(albumId).update({
        songCount:  FieldValue.increment(1),
        updatedAt:  new Date(),
      });
    }, `incrementSongCount(${albumId})`);
  }

  /**
   * update(id, data) → object
   *
   * Partial update for an existing album document.
   * Used by admin to update album metadata (name, coverUrl, year, genre).
   *
   * @param {string} id
   * @param {object} data
   * @returns {Promise<object>}
   */
  async update(id, data) {
    return super.update(id, data);
  }
}

module.exports = AlbumRepository;