/**
 * server/src/repositories/PlaylistRepository.js
 *
 * Phase 2 — Task 2.1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All Firestore access for the playlists collection.
 * Extends BaseRepository — every call goes through the circuit breaker
 * and retryFirestore automatically.
 *
 * Methods:
 *   findById(id)                 — fetch one playlist by ID
 *   findByUserId(uid)            — all playlists owned by a user
 *   findAllPublic()              — all public playlists (admin listing)
 *   create(data)                 — create new playlist document
 *   update(id, data)             — partial update existing playlist
 *   delete(id)                   — delete playlist document
 *   addSong(id, songId)          — append songId to songs array (atomic)
 *   removeSong(id, songId)       — remove songId from songs array (atomic)
 *
 * Firestore indexes required:
 *   playlists: createdBy + createdAt DESC  — findByUserId ordering
 *   playlists: isPublic + createdAt DESC   — findAllPublic ordering
 *
 * Response shapes:
 *   Playlist documents are returned as plain objects (formatDoc).
 *   No service-level normalization here — PlaylistService owns that.
 */

'use strict';
const { Playlist } = require('../models/Playlist');
const { admin }      = require('../config/firebase');
const BaseRepository = require('./BaseRepository');

const FieldValue = admin.firestore.FieldValue;

class PlaylistRepository extends BaseRepository {
  /**
   * @param {FirebaseFirestore.Firestore} db
   */
  constructor(db) {
    super(db, 'playlists');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * findById(id) → object | null
   *
   * @param {string} id — Firestore document ID
   * @returns {Promise<object | null>}
   */
  async findById(id) {
    const raw = await super.findById(id);
return raw ? Playlist.fromFirestore(raw) : null;
  }

  /**
   * findByUserId(uid) → object[]
   *
   * All playlists owned by a specific user, ordered by createdAt DESC.
   * Used by GET /api/users/:uid/playlists.
   * Requires Firestore composite index: playlists / createdBy + createdAt DESC.
   *
   * @param {string} uid — Firebase Auth UID
   * @returns {Promise<object[]>}
   */
  async findByUserId(uid) {
    return this._callFirestore(async () => {
      const snap = await this._db
        .collection('playlists')
        .where('ownerId', '==', uid)
        .orderBy('createdAt', 'desc')
        .get();
      return snap.docs.map((doc) => Playlist.fromFirestore(this.formatDoc(doc)));
    }, `findByUserId(${uid})`);
  }

  /**
   * findAllPublic() → object[]
   *
   * All public playlists ordered by createdAt DESC.
   * Used by GET /api/playlists/admin (public listing — no auth required).
   * Requires Firestore composite index: playlists / isPublic + createdAt DESC.
   *
   * @returns {Promise<object[]>}
   */
  async findAllPublic() {
    return this._callFirestore(async () => {
      const snap = await this._db
        .collection('playlists')
        .where('isPublic', '==', true)
        .orderBy('createdAt', 'desc')
        .get();
      return snap.docs.map((doc) => Playlist.fromFirestore(this.formatDoc(doc)));
    }, 'findAllPublic');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * create(data) → object
   *
   * Create a new playlist with Firestore auto-generated ID.
   *
   * @param {object} data — playlist payload (see Playlist.js PlaylistSchema)
   * @returns {Promise<object>}
   */
  async create(data) {
    return super.create(data);
  }

  /**
   * update(id, data) → object
   *
   * Partial update for an existing playlist.
   *
   * @param {string} id   — Firestore document ID
   * @param {object} data — fields to update
   * @returns {Promise<object>}
   */
  async update(id, data) {
    return super.update(id, data);
  }

  /**
   * delete(id) → boolean
   *
   * @param {string} id — Firestore document ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    return super.delete(id);
  }

  /**
   * addSong(id, songId) → void
   *
   * Atomically appends a songId to the playlist's songs array.
   * Uses FieldValue.arrayUnion to prevent duplicates.
   *
   * @param {string} id     — playlist document ID
   * @param {string} songId — song document ID to add
   * @returns {Promise<void>}
   */
  async addSong(id, songId) {
    return this._callFirestore(async () => {
      await this._db.collection('playlists').doc(id).update({
        songs:     FieldValue.arrayUnion(songId),
        updatedAt: new Date(),
      });
    }, `addSong(playlistId=${id}, songId=${songId})`);
  }

  /**
   * removeSong(id, songId) → void
   *
   * Atomically removes a songId from the playlist's songs array.
   * Uses FieldValue.arrayRemove.
   *
   * @param {string} id     — playlist document ID
   * @param {string} songId — song document ID to remove
   * @returns {Promise<void>}
   */
  async removeSong(id, songId) {
    return this._callFirestore(async () => {
      await this._db.collection('playlists').doc(id).update({
        songs:     FieldValue.arrayRemove(songId),
        updatedAt: new Date(),
      });
    }, `removeSong(playlistId=${id}, songId=${songId})`);
  }
}

module.exports = PlaylistRepository;