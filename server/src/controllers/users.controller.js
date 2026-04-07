/**
 * server/src/controllers/users.controller.js
 *
 * ADDED: logSessionPicks
 *   POST /users/:uid/session-picks
 *
 *   Receives batched pick events from the frontend for co-occurrence data
 *   collection (Option B foundation). Each pick records:
 *     - songId: the song that was picked
 *     - previousSongId: the song that was playing before (co-occurrence signal)
 *     - contextType: 'library' | 'playlist' | 'liked' | 'dynamic'
 *     - contextId: playlist ID or null
 *     - ts: client-side timestamp (ms)
 *     - sessionId: generated server-side from uid + date for grouping
 *
 *   Storage: Firestore subcollection users/{uid}/sessionPicks/{docId}
 *   Each doc is a batch of picks (not one doc per pick) to minimize write volume.
 *
 *   Non-blocking design: errors are logged but never surfaced to client.
 *   Frontend fire-and-forget — 200 OK always on valid input.
 *
 * PRESERVED: getLikedSongs, toggleLikedSong, getAllUsers unchanged.
 */

const { db } = require('../config/firebase');
const { getAllUsers } = require('../services/firebase.service');
const logger = require('../utils/logger');

// ── GET /users ────────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    let users = await getAllUsers();
    users = users.map((u) => ({ ...u, likedSongs: undefined }));
    res.json({ success: true, data: users });
  } catch (err) {
    logger.error('getAllUsers error:', { error: err.message });
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /users/:uid/liked-songs ───────────────────────────────────────────────
exports.getLikedSongs = async (req, res) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  try {
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      return res.json({ success: true, data: [] });
    }

    const likedSongIds = userDoc.data().likedSongs ?? [];

    if (likedSongIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const refs  = likedSongIds.map((id) => db.collection('songs').doc(id));
    const snaps = await db.getAll(...refs);

    const songs = snaps
      .filter((snap) => snap.exists)
      .map((snap) => ({ id: snap.id, ...snap.data() }));

    return res.json({ success: true, data: songs });
  } catch (err) {
    logger.error('getLikedSongs error:', { uid, error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch liked songs' });
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

    const updatedList = await db.runTransaction(async (tx) => {
      const snap       = await tx.get(userRef);
      const likedSongs = snap.exists ? (snap.data().likedSongs ?? []) : [];

      const nextList = likedSongs.includes(songId)
        ? likedSongs.filter((id) => id !== songId)
        : [...likedSongs, songId];

      tx.set(userRef, { likedSongs: nextList }, { merge: true });
      return nextList;
    });

    res.json({ success: true, data: updatedList });
  } catch (err) {
    logger.error('toggleLikedSong error:', { uid, songId, error: err.message });
    res.status(500).json({ success: false, message: 'Failed to toggle liked song' });
  }
};

// ── POST /users/:uid/session-picks ────────────────────────────────────────────
// Receives batched pick events for co-occurrence data collection.
// Fire-and-forget from client — always returns 200 on valid input.
// Errors are logged server-side but never returned to client.
exports.logSessionPicks = async (req, res) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { picks } = req.body;

  // Validate payload shape — must be a non-empty array
  if (!Array.isArray(picks) || picks.length === 0) {
    return res.status(400).json({ success: false, message: 'picks must be a non-empty array' });
  }

  // Cap batch size to prevent abuse — matches frontend FLUSH_EVERY threshold
  const MAX_PICKS_PER_BATCH = 50;
  if (picks.length > MAX_PICKS_PER_BATCH) {
    return res.status(400).json({
      success: false,
      message: `picks batch too large — max ${MAX_PICKS_PER_BATCH} per request`,
    });
  }

  // Respond immediately — Firestore write is non-blocking from client's perspective
  res.json({ success: true });

  // Validate and sanitize each pick entry
  const sanitized = picks
    .filter((p) => p && typeof p.songId === 'string' && p.songId.trim())
    .map((p) => ({
      songId:         p.songId.trim(),
      previousSongId: typeof p.previousSongId === 'string' ? p.previousSongId.trim() : null,
      contextType:    ['library', 'playlist', 'liked', 'dynamic'].includes(p.contextType)
                        ? p.contextType
                        : 'library',
      contextId:      typeof p.contextId === 'string' ? p.contextId.trim() : null,
      // Use server timestamp for storage — client ts kept for ordering within batch
      clientTs:       typeof p.ts === 'number' ? p.ts : Date.now(),
    }));

  if (!sanitized.length) {
    // All picks were invalid — already responded 200, just return
    return;
  }

  // Session ID: uid + UTC date — groups all picks from a calendar day
  const today     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const sessionId = `${uid}_${today}`;

  try {
    await db
      .collection('users')
      .doc(uid)
      .collection('sessionPicks')
      .add({
        sessionId,
        picks:    sanitized,
        pickedAt: new Date(),
      });
  } catch (err) {
    // Non-critical — log but do not re-surface (response already sent)
    logger.error('logSessionPicks write error:', { uid, error: err.message });
  }
};