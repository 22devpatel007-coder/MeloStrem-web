/**
 * server/src/controllers/albums.controller.js
 *
 * Phase 3 — Task 3.3: Pagination cap added to getAlbumSongs.
 *
 * Changes from previous version (Task 3.1 cache version):
 *
 *   getAlbumSongs — added .limit(MAX_ALBUM_SONGS) to the Firestore query.
 *
 *     WHY: The previous query had no .limit() cap. At 10,000+ songs in the
 *     library, a single album linked to many songs could return an unbounded
 *     result set. Each Firestore document is ~2KB; 500 songs = 1MB per request
 *     per user. The plan specifies max 200 for album songs (albums are bounded
 *     collections — a real album never has 200+ tracks).
 *
 *     MAX_ALBUM_SONGS = 200:
 *       - Generous for any real album (typical: 8–20 tracks)
 *       - Protects against pathological data (e.g. a compilation accidentally
 *         linked to hundreds of songs)
 *       - Matches the cap documented in the Phase 3 plan exactly
 *
 *     The .limit() is applied on the Firestore query BEFORE the in-memory
 *     null-trackNumber sort. The sort still works correctly on the capped set.
 *
 *     Cache behavior unchanged — result is still cached under albums:songs:<id>
 *     with TTL ALBUM_SONGS. The cap is part of the cached result.
 *
 * Everything else is IDENTICAL to the previous version (Task 3.1):
 *   - getAlbum: untouched (single-document fetch, no cap needed)
 *   - All cache read/write logic: untouched
 *   - All error handling (AppError subclasses): untouched
 *   - Response shapes: identical ({ songs, albumId } contract unchanged)
 *   - trackNumber null-sort logic: untouched
 */

'use strict';

const { db }  = require('../config/firebase');
const cache   = require('../services/cache.service');
const logger  = require('../utils/logger');
const { ValidationError, NotFoundError, InternalError } = require('../errors');
const { retryFirestore } = require('../utils/retryFirestore');
const { Song } = require('../models/Song');
/**
 * Maximum songs returned for a single album.
 * Albums are bounded collections — this cap prevents unbounded Firestore
 * scans on pathological data while being generous for any real album.
 * Per Phase 3 plan: "fix to max 200 since albums are typically small".
 */
const MAX_ALBUM_SONGS = 200;

// ── GET /api/albums/:id ────────────────────────────────────────────────────
// Cache: albums:id:<id>  TTL: 600s (10 min)
exports.getAlbum = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new ValidationError('Invalid album ID', 'VALIDATION_ERROR');
    }

    const albumId = id.trim();
    const key     = `albums:id:${albumId}`;

    // ── Cache read ────────────────────────────────────────────────────────
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // ── Cache miss → Firestore ────────────────────────────────────────────
    const snap = await retryFirestore(() => db.collection('albums').doc(albumId).get(), { label: 'getAlbum:fetch' });

    if (!snap.exists) {
      throw new NotFoundError('Album not found', 'NOT_FOUND');
    }

    const data   = snap.data();
    const result = {
      id:        snap.id,
      ...data,
      createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
      updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
    };

    // ── Cache write ───────────────────────────────────────────────────────
    cache.set(key, result, cache.TTL.ALBUM);

    return res.json(result);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error('getAlbum unexpected error:', { error: err.message, albumId: req.params.id });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};

// ── GET /api/albums/:id/songs ──────────────────────────────────────────────
// Cache: albums:songs:<id>  TTL: 300s (5 min)
// Capped at MAX_ALBUM_SONGS (200) — albums are bounded, 200 is generous.
// Non-paginated — single cache key per album, no cursor variants needed.
exports.getAlbumSongs = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== 'string' || !id.trim()) {
      throw new ValidationError('Invalid album ID', 'VALIDATION_ERROR');
    }

    const albumId = id.trim();
    const key     = `albums:songs:${albumId}`;

    // ── Cache read ────────────────────────────────────────────────────────
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // ── Cache miss → Firestore ────────────────────────────────────────────
    const albumSnap = await db.collection('albums').doc(albumId).get();
    if (!albumSnap.exists) {
      throw new NotFoundError('Album not found', 'NOT_FOUND');
    }

    // Task 3.3: .limit(MAX_ALBUM_SONGS) caps the Firestore scan.
    // Albums are bounded collections — 200 is generous for any real album.
    // Firestore applies the limit server-side before transferring documents,
    // so this prevents memory exhaustion regardless of collection size.
    const snaps = await db
      .collection('songs')
      .where('albumId', '==', albumId)
      .orderBy('trackNumber', 'asc')
      .limit(MAX_ALBUM_SONGS)
      .get();

    const songs = snaps.docs.map((snap) => {
  const data = { id: snap.id, ...snap.data() };
  if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
  if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();
  return Song.fromFirestore(data);
});

    // Push songs with null/undefined trackNumber to the end of the list.
    // This sort runs on the already-capped set — safe at any size up to 200.
    songs.sort((a, b) => {
      if (a.trackNumber == null && b.trackNumber == null) return 0;
      if (a.trackNumber == null) return 1;
      if (b.trackNumber == null) return -1;
      return a.trackNumber - b.trackNumber;
    });

    const result = { songs, albumId };

    // ── Cache write ───────────────────────────────────────────────────────
    // Cache even when songs array is empty — an empty album is a valid state.
    // songs.controller invalidates this key if a song is added to/removed from
    // this album, so stale empty-cache is not a concern.
    cache.set(key, result, cache.TTL.ALBUM_SONGS);

    return res.json(result);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error('getAlbumSongs unexpected error:', { error: err.message, albumId: req.params.id });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};