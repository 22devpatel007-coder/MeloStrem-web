/**
 * server/src/services/SuggestionService.js
 *
 * Business logic for playlist suggestions.
 * Follows the PascalCase service class pattern (UserService, PlaylistService).
 * Direct Firestore access via admin SDK — no Repository layer needed for
 * this simple collection.
 */

const { admin } = require('../config/firebase');

const COLLECTION = 'playlistSuggestions';

// 24 hours in milliseconds
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

class SuggestionService {
  /**
   * Submit a playlist link suggestion.
   * Enforces a 24-hour per-user submission limit at the Firestore level.
   *
   * @param {string} userId
   * @param {string} userEmail
   * @param {string} link
   * @param {string|null} playlistName
   * @returns {Promise<{ success: true, message: string }>}
   * @throws {{ status: 429, message: string }} if user already submitted today
   */
  static async submit({ userId, userEmail, link, playlistName }) {
    const db  = admin.firestore();
    const col = db.collection(COLLECTION);

    // ── 24-hour per-user guard ─────────────────────────────────────────────
    const since = admin.firestore.Timestamp.fromMillis(Date.now() - ONE_DAY_MS);

    const recent = await col
      .where('userId', '==', userId)
      .where('status', '==', 'pending')
      .where('createdAt', '>=', since)
      .limit(1)
      .get();

    if (!recent.empty) {
      const err = new Error('You have already submitted a playlist suggestion in the last 24 hours.');
      err.status = 429;
      throw err;
    }

    // ── Write ──────────────────────────────────────────────────────────────
    await col.add({
      userId,
      userEmail,
      link,
      playlistName: playlistName || null,
      status:       'pending',
      createdAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, message: 'Suggestion received.' };
  }

  /**
   * Fetch all suggestions ordered by createdAt descending (newest first).
   * Admin-only — the route applies verifyTokenStrict + isAdmin before calling.
   *
   * @returns {Promise<Array>}
   */
  static async update({ id, status, adminMessage }) {
    const db  = admin.firestore();
    const ref = db.collection(COLLECTION).doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      const err = new Error('Suggestion not found.');
      err.status = 404;
      throw err;
    }

    await ref.update({
      status,
      adminMessage: adminMessage?.trim() || null,
      updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true, message: 'Suggestion updated.' };
  }
  static async listByUser(uid) {
    const db = admin.firestore();
    const snapshot = await db
      .collection(COLLECTION)
      .where('userId', '==', uid)
      .orderBy('createdAt', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }
  static async list({ cursor = null, limit = 10 } = {}) {
    const db  = admin.firestore();
    let query = db
      .collection(COLLECTION)
      .orderBy('createdAt', 'desc')
      .limit(limit + 1);

    if (cursor) {
      const cursorDoc = await db.collection(COLLECTION).doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }

    const snapshot = await query.get();
    const docs     = snapshot.docs.slice(0, limit);
    const hasMore  = snapshot.docs.length > limit;
    const nextCursor = hasMore ? docs[docs.length - 1].id : null;

    return {
      suggestions: docs.map((doc) => ({ id: doc.id, ...doc.data() })),
      nextCursor,
      hasMore,
    };
  }
}

module.exports = SuggestionService;