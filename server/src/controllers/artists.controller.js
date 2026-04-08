/**
 * server/src/controllers/artists.controller.js
 *
 * Handles read requests for Artist documents and their associated songs.
 *
 * getArtist      — returns a single Artist document by ID
 * getArtistSongs — returns paginated songs where artistId === :id,
 *                  using the same cursor pagination contract as /api/songs
 *
 * Both handlers return safe, friendly error messages to clients and log
 * technical details for developers — consistent with songs.controller.js.
 */

const { db } = require('../config/firebase');
const logger  = require('../utils/logger');

const INTERNAL_ERROR  = 'Something went wrong. Please try again.';
const SONGS_PER_PAGE  = 30;
const MAX_SONGS_LIMIT = 50;

// ── GET /api/artists/:id ───────────────────────────────────────────────────
exports.getArtist = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ error: 'Invalid artist ID', code: 'VALIDATION_ERROR' });
    }

    const snap = await db.collection('artists').doc(id.trim()).get();

    if (!snap.exists) {
      return res.status(404).json({ error: 'Artist not found', code: 'NOT_FOUND' });
    }

    const data = snap.data();
    return res.json({
      id:         snap.id,
      ...data,
      createdAt:  data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
      updatedAt:  data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
    });
  } catch (err) {
    logger.error('getArtist error:', { error: err.message, artistId: req.params.id });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

// ── GET /api/artists/:id/songs ─────────────────────────────────────────────
// Uses cursor pagination — same contract as GET /api/songs:
//   Returns: { songs: Song[], nextCursor: string | null, hasMore: boolean }
//
// Query params:
//   limit  — number of songs per page (default 30, max 50)
//   cursor — Firestore document ID to start after (for pagination)
exports.getArtistSongs = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ error: 'Invalid artist ID', code: 'VALIDATION_ERROR' });
    }

    const limit  = Math.min(parseInt(req.query.limit) || SONGS_PER_PAGE, MAX_SONGS_LIMIT);
    const cursor = req.query.cursor || null;

    // Verify artist exists first — return 404 rather than an empty songs list
    // for an unknown ID (better DX and consistent with getArtist).
    const artistSnap = await db.collection('artists').doc(id.trim()).get();
    if (!artistSnap.exists) {
      return res.status(404).json({ error: 'Artist not found', code: 'NOT_FOUND' });
    }

    // Build paginated query — filter by artistId, order by createdAt desc
    // (most recent songs first, matching the default library sort).
    let query = db
      .collection('songs')
      .where('artistId', '==', id.trim())
      .orderBy('createdAt', 'desc')
      .limit(limit + 1); // fetch one extra to determine hasMore

    if (cursor) {
      const cursorSnap = await db.collection('songs').doc(cursor).get();
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snaps = await query.get();
    const docs  = snaps.docs;

    const hasMore    = docs.length > limit;
    const pageDocs   = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? pageDocs[pageDocs.length - 1].id : null;

    const songs = pageDocs.map((snap) => {
      const data = snap.data();
      return {
        id:        snap.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
      };
    });

    return res.json({ songs, nextCursor, hasMore });
  } catch (err) {
    logger.error('getArtistSongs error:', { error: err.message, artistId: req.params.id });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};