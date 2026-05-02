/**
 * server/src/repositories/UserRepository.js
 *
 * Phase 2 — Task 2.1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All Firestore access for the users collection.
 * Extends BaseRepository — every call goes through the circuit breaker
 * and retryFirestore automatically.
 *
 * Methods:
 *   findById(uid)                    — fetch one user by Firebase UID
 *   findAll()                        — fetch all users (admin only)
 *   upsert(uid, data)                — set-with-merge (create or update)
 *   getLikedSongs(uid)               — get user's liked song ID array
 *   toggleLikedSong(uid, songId)     — add or remove a song from liked list
 *   appendSessionPicks(uid, picks)   — append session picks to history sub-field
 *
 * Firestore indexes required:
 *   users: createdAt DESC  — findAll ordering
 *
 * Notes:
 *   - likedSongs is stored as an array field on the user document.
 *   - FieldValue.arrayUnion / arrayRemove are used for atomic array ops.
 *   - Session picks write is intentionally fire-and-forget (no return needed).
 */

"use strict";
const { User } = require("../models/User");
const admin = require("firebase-admin");
const BaseRepository = require("./BaseRepository");

const FieldValue = admin.firestore.FieldValue;

class UserRepository extends BaseRepository {
  /**
   * @param {FirebaseFirestore.Firestore} db
   */
  constructor(db) {
    super(db, "users");
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * findById(uid) → object | null
   *
   * @param {string} uid — Firebase Auth UID
   * @returns {Promise<object | null>}
   */
  async findById(uid) {
    const raw = await super.findById(uid);
    return raw ? User.fromFirestore(raw) : null;
  }

  /**
   * findAll() → object[]
   *
   * Fetch all users ordered by createdAt DESC.
   * Admin-only operation — enforce isAdmin middleware at route level.
   *
   * @returns {Promise<object[]>}
   */
  async findAll() {
    return this._callFirestore(async () => {
      const snap = await this._db
        .collection("users")
        .orderBy("createdAt", "desc")
        .limit(500)
        .get();
      return snap.docs.map((doc) => User.fromFirestore(this.formatDoc(doc)));
    }, "findAll");
  }

  /**
   * getLikedSongs(uid) → string[]
   *
   * Returns the user's liked song IDs array.
   * Returns empty array if user does not exist or likedSongs is not set.
   *
   * @param {string} uid
   * @returns {Promise<string[]>}
   */
  async getLikedSongs(uid) {
    return this._callFirestore(async () => {
      const snap = await this._db.collection("users").doc(uid).get();
      if (!snap.exists) return [];
      return snap.data().likedSongs || [];
    }, `getLikedSongs(${uid})`);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * upsert(uid, data) → object
   *
   * Set-with-merge: creates the user document if it doesn't exist,
   * or merges the provided fields into an existing document.
   * Used for profile creation and partial profile updates.
   *
   * @param {string} uid
   * @param {object} data
   * @returns {Promise<object>}
   */
  async upsert(uid, data) {
    return this.set(uid, data, { merge: true });
  }

  /**
   * toggleLikedSong(uid, songId) → { likedSongs: string[], liked: boolean }
   *
   * Atomically adds or removes a song ID from the user's likedSongs array.
   * Uses FieldValue.arrayUnion / arrayRemove to avoid race conditions.
   *
   * Returns the updated likedSongs array and whether the song is now liked.
   *
   * @param {string} uid
   * @param {string} songId
   * @returns {Promise<{ likedSongs: string[], liked: boolean }>}
   */
  async toggleLikedSong(uid, songId) {
    return this._callFirestore(async () => {
      const userRef = this._db.collection("users").doc(uid);
      const snap = await userRef.get();

      // Create user document with empty likedSongs if it doesn't exist
      if (!snap.exists) {
        await userRef.set(
          User.toFirestore(
            { uid, likedSongs: [], createdAt: new Date() },
            "create",
          ),
          { merge: true },
        );
      }

      const currentLiked = snap.exists ? snap.data().likedSongs || [] : [];
      const isCurrentlyLiked = currentLiked.includes(songId);

      const update = isCurrentlyLiked
        ? { likedSongs: FieldValue.arrayRemove(songId), updatedAt: new Date() }
        : { likedSongs: FieldValue.arrayUnion(songId), updatedAt: new Date() };

      await userRef.update(update);

      // Return the updated list without a second Firestore read
      const updatedLiked = isCurrentlyLiked
        ? currentLiked.filter((id) => id !== songId)
        : [...currentLiked, songId];

      return { likedSongs: updatedLiked, liked: !isCurrentlyLiked };
    }, `toggleLikedSong(uid=${uid}, songId=${songId})`);
  }

  /**
   * appendSessionPicks(uid, picks) → void
   *
   * Appends session pick entries to the user's sessionHistory field.
   * Fire-and-forget — does not return meaningful data to the caller.
   * Caller (controller) must not await this for the HTTP response path.
   *
   * Server cap: picks array is pre-validated to max 50 items before
   * this method is called. Enforced in UserService / controller.
   *
   * @param {string}   uid
   * @param {object[]} picks — validated picks array (max 50 items)
   * @returns {Promise<void>}
   */
  async appendSessionPicks(uid, picks) {
    return this._callFirestore(async () => {
      const userRef = this._db.collection("users").doc(uid);
      await userRef.set(
        {
          sessionHistory: FieldValue.arrayUnion(...picks),
          updatedAt: new Date(),
        },
        { merge: true },
      );
    }, `appendSessionPicks(uid=${uid}, count=${picks.length})`);
  }
  async writeSessionPicks(uid, sessionId, picks) {
    return this._callFirestore(async () => {
      await this._db
        .collection("users")
        .doc(uid)
        .collection("sessionPicks")
        .add({ sessionId, picks, pickedAt: new Date() });
    }, `writeSessionPicks(${uid})`);
  }
  async removeSongFromAllUsers(songId) {
    return this._callFirestore(async () => {
      const snap = await this._db
        .collection("users")
        .where("likedSongs", "array-contains", songId)
        .get();

      if (snap.empty) return;

      const BATCH_SIZE = 500;
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += BATCH_SIZE) {
        const batch = this._db.batch();
        docs.slice(i, i + BATCH_SIZE).forEach((doc) => {
          batch.update(doc.ref, {
            likedSongs: FieldValue.arrayRemove(songId),
            updatedAt: new Date(),
          });
        });
        await batch.commit();
      }
    }, `removeSongFromAllUsers(songId=${songId})`);
  }
}

module.exports = UserRepository;
