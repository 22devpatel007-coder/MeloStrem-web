/**
 * server/src/controllers/albums.controller.js
 *
 * Handles read requests for Album documents and their associated songs.
 *
 * getAlbum      — returns a single Album document by ID
 * getAlbumSongs — returns all songs in an album ordered by trackNumber asc
 *                 (non-paginated — albums are bounded in size)
 *
 * PHASE 1 — TASK 1.1 changes:
 *   - All direct res.status(4xx/5xx).json() error calls replaced with throws.
 *   - Controllers no longer call res.json() for errors — errorHandler owns that.
 *   - Success responses (res.json with data) are completely unchanged.
 *   - Business logic, Firestore queries, sort logic: untouched.
 */

'use strict';

const { db } = require('../config/firebase');
const logger  = require('../utils/logger');
const { ValidationError, NotFoundError, InternalError } = require('../errors');

// ── GET /api/albums/:id ────────────────────────────────────────────────────
exports.getAlbum = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new ValidationError('Invalid album ID', 'VALIDATION_ERROR');
    }

    const snap = await db.collection('albums').doc(id.trim()).get();

    if (!snap.exists) {
      throw new NotFoundError('Album not found', 'NOT_FOUND');
    }

    const data = snap.data();
    return res.json({
      id:        snap.id,
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
    });
  } catch (err) {
    // Re-throw AppErrors so errorHandler handles them with the correct status.
    // Wrap unknown errors so stack trace is always logged.
    if (err.isOperational !== undefined) return next(err);
    logger.error('getAlbum unexpected error:', { error: err.message, albumId: req.params.id });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
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
exports.getAlbumSongs = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new ValidationError('Invalid album ID', 'VALIDATION_ERROR');
    }

    // Verify album exists — return 404 for unknown ID.
    const albumSnap = await db.collection('albums').doc(id.trim()).get();
    if (!albumSnap.exists) {
      throw new NotFoundError('Album not found', 'NOT_FOUND');
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
    if (err.isOperational !== undefined) return next(err);
    logger.error('getAlbumSongs unexpected error:', { error: err.message, albumId: req.params.id });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};