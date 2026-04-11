/**
 * server/src/controllers/users.controller.js
 *
 * PERMANENT FIX — ECONNRESET / socket hang up on getLikedSongs
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Root cause:
 *   getLikedSongs made two raw Firestore calls:
 *     1. db.collection('users').doc(uid).get()
 *     2. db.getAll(...refs)
 *   Both were single unguarded attempts. When Render's idle socket drops,
 *   both throw ECONNRESET with no retry, surfacing as a 500 to the client.
 *
 *   logSessionPicks had the same issue: the fire-and-forget write to
 *   sessionPicks had no retry, causing silent data loss under network blips.
 *
 * Fix:
 *   All direct db.* calls are now wrapped in retryFirestore().
 *   The service layer (firebase.service.js) also retries its own calls,
 *   so getAllUsers is doubly safe.
 *   logSessionPicks retry is intentionally capped at 2 attempts since
 *   it is fire-and-forget telemetry — we don't want it blocking.
 *
 * No changes to response shapes or route contracts.
 */

'use strict';

const { db }             = require('../config/firebase');
const { getAllUsers }    = require('../services/firebase.service');
const { retryFirestore } = require('../utils/retryFirestore');
const logger             = require('../utils/logger');

// ── GET /users ────────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    let users = await getAllUsers(); // already retried inside firebase.service
    users = users.map((u) => ({ ...u, likedSongs: undefined }));
    res.json({ success: true, data: users });
  } catch (err) {
    logger.error('getAllUsers error:', { error: err.message });
    res.status(500).json({ success: false, message: 'Failed to fetch users. Please try again.' });
  }
};

// ── GET /users/:uid/liked-songs ───────────────────────────────────────────────
exports.getLikedSongs = async (req, res) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  try {
    // FIX: wrap both Firestore calls in retryFirestore so ECONNRESET /
    // socket hang up errors are automatically retried with backoff.
    const userDoc = await retryFirestore(
      () => db.collection('users').doc(uid).get(),
      { label: 'getLikedSongs:userDoc' }
    );

    if (!userDoc.exists) {
      return res.json({ success: true, data: [] });
    }

    const likedSongIds = userDoc.data().likedSongs ?? [];

    if (likedSongIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const refs  = likedSongIds.map((id) => db.collection('songs').doc(id));
    const snaps = await retryFirestore(
      () => db.getAll(...refs),
      { label: 'getLikedSongs:getAll' }
    );

    const songs = snaps
      .filter((snap) => snap.exists)
      .map((snap) => {
        const data = snap.data();
        return {
          id: snap.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
        };
      });

    return res.json({ success: true, data: songs });
  } catch (err) {
    logger.error('getLikedSongs error:', { uid, error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch liked songs. Please try again.' });
  }
};

// ── POST /users/:uid/liked-songs/:songId ──────────────────────────────────────
exports.toggleLikedSong = async (req, res) => {
  const { uid, songId } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  if (!songId) {
    return res.status(400).json({ success: false, message: 'songId is required' });
  }

  try {
    const userRef = db.collection('users').doc(uid);

    // FIX: wrap transaction in retryFirestore — transactions are safe to retry
    // since Firestore transactions are atomic and idempotent on retry.
    const updatedList = await retryFirestore(
      () => db.runTransaction(async (tx) => {
        const snap       = await tx.get(userRef);
        const likedSongs = snap.exists ? (snap.data().likedSongs ?? []) : [];

        const nextList = likedSongs.includes(songId)
          ? likedSongs.filter((id) => id !== songId)
          : [...likedSongs, songId];

        tx.set(userRef, { likedSongs: nextList }, { merge: true });
        return nextList;
      }),
      { label: 'toggleLikedSong' }
    );

    res.json({ success: true, data: updatedList });
  } catch (err) {
    logger.error('toggleLikedSong error:', { uid, songId, error: err.message });
    res.status(500).json({ success: false, message: 'Failed to update liked songs. Please try again.' });
  }
};

// ── POST /users/:uid/session-picks ────────────────────────────────────────────
exports.logSessionPicks = async (req, res) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { picks } = req.body;

  if (!Array.isArray(picks) || picks.length === 0) {
    return res.status(400).json({ success: false, message: 'picks must be a non-empty array' });
  }

  const MAX_PICKS_PER_BATCH = 50;
  if (picks.length > MAX_PICKS_PER_BATCH) {
    return res.status(400).json({
      success: false,
      message: `picks batch too large — max ${MAX_PICKS_PER_BATCH} per request`,
    });
  }

  // Respond immediately — telemetry write is non-blocking from client's perspective
  res.json({ success: true });

  const sanitized = picks
    .filter((p) => p && typeof p.songId === 'string' && p.songId.trim())
    .map((p) => ({
      songId:         p.songId.trim(),
      previousSongId: typeof p.previousSongId === 'string' ? p.previousSongId.trim() : null,
      contextType:    ['library', 'playlist', 'liked', 'dynamic'].includes(p.contextType)
                        ? p.contextType
                        : 'library',
      contextId:      typeof p.contextId === 'string' ? p.contextId.trim() : null,
      clientTs:       typeof p.ts === 'number' ? p.ts : Date.now(),
    }));

  if (!sanitized.length) return;

  const today     = new Date().toISOString().slice(0, 10);
  const sessionId = `${uid}_${today}`;

  try {
    // FIX: retry with reduced budget (2 attempts) since this is fire-and-forget
    // telemetry — we want one retry on transient failures but don't want to
    // accumulate backlog on repeated failures.
    await retryFirestore(
      () => db
        .collection('users')
        .doc(uid)
        .collection('sessionPicks')
        .add({ sessionId, picks: sanitized, pickedAt: new Date() }),
      { maxAttempts: 2, label: 'logSessionPicks' }
    );
  } catch (err) {
    // Non-blocking — client already received success. Log and move on.
    logger.error('logSessionPicks write error:', { uid, error: err.message });
  }
};