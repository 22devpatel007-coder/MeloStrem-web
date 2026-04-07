// PERMANENT FIX: getLikedSongs now resolves IDs → full Song objects via
// Firestore getAll() batch fetch. One round-trip for N documents.
// Frontend no longer depends on the paginated song library to display liked songs.

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
// Previously returned: string[]  (IDs only)
// Now returns:         Song[]    (full objects, ghost IDs silently filtered)
exports.getLikedSongs = async (req, res) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  try {
    const userDoc = await db.collection('users').doc(uid).get();

    if (!userDoc.exists) {
      // New account — return empty list, not 404
      return res.json({ success: true, data: [] });
    }

    const likedSongIds = userDoc.data().likedSongs ?? [];

    if (likedSongIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Firestore getAll: one round-trip for N documents (max 500 per call — safe
    // for realistic liked song counts; add chunking if you ever expect >500).
    const refs = likedSongIds.map((id) => db.collection('songs').doc(id));
    const snaps = await db.getAll(...refs);

    const songs = snaps
      .filter((snap) => snap.exists)           // silently drop ghost IDs
      .map((snap) => ({ id: snap.id, ...snap.data() }));

    return res.json({ success: true, data: songs });
  } catch (err) {
    logger.error('getLikedSongs error:', { uid, error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch liked songs' });
  }
};

// ── POST /users/:uid/liked-songs/:songId ──────────────────────────────────────
// No change needed here — toggle still works with IDs internally.
// The GET above re-resolves full objects on next fetch/invalidation.
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
      const snap = await tx.get(userRef);
      const likedSongs = snap.exists ? (snap.data().likedSongs ?? []) : [];

      const nextList = likedSongs.includes(songId)
        ? likedSongs.filter((id) => id !== songId)
        : [...likedSongs, songId];

      tx.set(userRef, { likedSongs: nextList }, { merge: true });
      return nextList;
    });

    // Return updated ID list — frontend invalidates query and re-fetches full objects
    res.json({ success: true, data: updatedList });
  } catch (err) {
    logger.error('toggleLikedSong error:', { uid, songId, error: err.message });
    res.status(500).json({ success: false, message: 'Failed to toggle liked song' });
  }
};