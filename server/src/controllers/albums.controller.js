/**
 * server/src/controllers/albums.controller.js
 *
 * Handles read requests for Album documents and their associated songs.
 *
 * getAlbum      — returns a single Album document by ID
 * getAlbumSongs — returns all songs in an album ordered by trackNumber asc
 *                 (non-paginated — albums are bounded in size)
 */

const { db } = require('../config/firebase');
const logger  = require('../utils/logger');

const INTERNAL_ERROR = 'Something went wrong. Please try again.';

// ── GET /api/albums/:id ────────────────────────────────────────────────────
exports.getAlbum = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ error: 'Invalid album ID', code: 'VALIDATION_ERROR' });
    }

    const snap = await db.collection('albums').doc(id.trim()).get();

    if (!snap.exists) {
      return res.status(404).json({ error: 'Album not found', code: 'NOT_FOUND' });
    }

    const data = snap.data();
    return res.json({
      id:        snap.id,
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
    });
  } catch (err) {
    logger.error('getAlbum error:', { error: err.message, albumId: req.params.id });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

// ── GET /api/albums/:id/songs ──────────────────────────────────────────────
// Returns all songs for this album ordered by trackNumber ascending.
// Non-paginated: albums are bounded (typically < 30 songs) and consumed
// as a complete list by AlbumDetail page — cursor pagination not needed.
//
// Songs with null trackNumber are sorted last (Firestore orders nulls first
// in ascending queries, so we push them to the end client-side after fetch).
//
// Returns: { songs: Song[], albumId: string }
exports.getAlbumSongs = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      return res.status(400).json({ error: 'Invalid album ID', code: 'VALIDATION_ERROR' });
    }

    // Verify album exists — return 404 for unknown ID.
    const albumSnap = await db.collection('albums').doc(id.trim()).get();
    if (!albumSnap.exists) {
      return res.status(404).json({ error: 'Album not found', code: 'NOT_FOUND' });
    }

    // Firestore query: filter by albumId, order by trackNumber ascending.
    // Songs without a trackNumber field will be included — they sort first in
    // Firestore's ascending order, so we sort them to the end after fetch.
    const snaps = await db
      .collection('songs')
      .where('albumId', '==', id.trim())
      .orderBy('trackNumber', 'asc')
      .get();

    const songs = snaps.docs.map((snap) => {
      const data = snap.data();
      return {
        id:        snap.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
      };
    });

    // Push songs with null/undefined trackNumber to the end of the list.
    // These are songs added to the album before trackNumber was introduced.
    songs.sort((a, b) => {
      if (a.trackNumber == null && b.trackNumber == null) return 0;
      if (a.trackNumber == null) return 1;
      if (b.trackNumber == null) return -1;
      return a.trackNumber - b.trackNumber;
    });

    return res.json({ songs, albumId: id.trim() });
  } catch (err) {
    logger.error('getAlbumSongs error:', { error: err.message, albumId: req.params.id });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};