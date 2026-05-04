/**
 * server/src/controllers/artists.controller.js
 *
 * PHASE 3 — TASK 3.1: In-Memory Cache with TTL
 *
 * Changes from previous version (ONLY cache logic added — nothing else touched):
 *
 *   getArtist      — cache GET before Firestore; cache SET after successful fetch.
 *                    Cache key: artists:id:<id>  TTL: 600s (10 min)
 *                    Artist metadata (name, bio, image) is near-static.
 *
 *   getArtistSongs — cache GET before Firestore; cache SET after successful fetch.
 *                    Cache key: artists:songs:<id>:<limit>:<cursor|"start">  TTL: 60s
 *                    Short TTL because new uploads should appear quickly.
 *
 * Unchanged from previous version:
 *   - All error handling (AppError subclasses from Task 1.1): preserved.
 *   - All success response shapes: identical.
 *   - Pagination logic, Firestore queries, sort logic: untouched.
 *   - No mutations in this controller — no invalidation needed here.
 *     Artist cache is invalidated by songs.controller when a song upload
 *     creates a new artist via findOrCreateArtist.
 *
 * Cache safety contract:
 *   - Every cache call is isolated — failure is a miss, never a crash.
 */

"use strict";
const { retryFirestore } = require('../utils/retryFirestore');
const { db } = require("../config/firebase");
const cache = require("../services/cache.service");
const logger = require("../utils/logger");
const { ValidationError, NotFoundError, InternalError } = require("../errors");
const { Song } = require('../models/Song');

const SONGS_PER_PAGE = 30;
const MAX_SONGS_LIMIT = 50;

// ── GET /api/artists/:id ───────────────────────────────────────────────────
// Cache: artists:id:<id>  TTL: 600s
exports.getArtist = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string" || !id.trim()) {
      throw new ValidationError("Invalid artist ID", "VALIDATION_ERROR");
    }

    const artistId = id.trim();
    const key = `artists:id:${artistId}`;

    // ── Cache read ────────────────────────────────────────────────────────
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // ── Cache miss → Firestore ────────────────────────────────────────────
    const snap = await db.collection("artists").doc(artistId).get();

    if (!snap.exists) {
      throw new NotFoundError("Artist not found", "NOT_FOUND");
    }

    const data = snap.data();
    const result = {
      id: snap.id,
      ...data,
      createdAt: data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : (data.createdAt ?? null),
      updatedAt: data.updatedAt?.toDate
        ? data.updatedAt.toDate().toISOString()
        : (data.updatedAt ?? null),
    };

    // ── Cache write ───────────────────────────────────────────────────────
    cache.set(key, result, cache.TTL.ARTIST);

    return res.json(result);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("getArtist unexpected error:", {
      error: err.message,
      artistId: req.params.id,
    });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── GET /api/artists/:id/songs ─────────────────────────────────────────────
// Cache: artists:songs:<id>:<limit>:<cursor|"start">  TTL: 60s
// Paginated — each unique limit+cursor combination gets its own cache entry.
// Short TTL (60s) so newly uploaded songs appear quickly for admin users.
exports.getArtistSongs = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id || typeof id !== "string" || !id.trim()) {
      throw new ValidationError("Invalid artist ID", "VALIDATION_ERROR");
    }

    const artistId = id.trim();
    const limit = Math.min(
      parseInt(req.query.limit) || SONGS_PER_PAGE,
      MAX_SONGS_LIMIT,
    );
    const cursor = req.query.cursor || null;
    const key = `artists:songs:${artistId}:${limit}:${cursor || "start"}`;

    // ── Cache read ────────────────────────────────────────────────────────
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // ── Cache miss → Firestore ────────────────────────────────────────────
    // Verify artist exists first — return 404 rather than empty songs list.
    const artistSnap = await retryFirestore(() => db.collection("artists").doc(artistId).get(), { label: 'getArtistSongs:artistCheck' });
    if (!artistSnap.exists) {
      throw new NotFoundError("Artist not found", "NOT_FOUND");
    }

    let query = db
      .collection("songs")
      .where("artistId", "==", artistId)
      .orderBy("createdAt", "desc")
      .limit(limit + 1);

    if (cursor) {
      const cursorSnap = await retryFirestore(() => db.collection("songs").doc(cursor).get(), { label: 'getArtistSongs:cursor' });
      if (cursorSnap.exists) {
        query = query.startAfter(cursorSnap);
      }
    }

    const snaps = await retryFirestore(() => query.get(), { label: 'getArtistSongs:songsFetch' });
    const docs = snaps.docs;
    const hasMore = docs.length > limit;
    const pageDocs = hasMore ? docs.slice(0, limit) : docs;
    const nextCursor = hasMore ? pageDocs[pageDocs.length - 1].id : null;

    const songs = pageDocs.map((snap) => {
  const data = { id: snap.id, ...snap.data() };
  if (data.createdAt?.toDate) data.createdAt = data.createdAt.toDate().toISOString();
  if (data.updatedAt?.toDate) data.updatedAt = data.updatedAt.toDate().toISOString();
  return Song.fromFirestore(data);
});

    const result = { songs, nextCursor, hasMore };

    // ── Cache write ───────────────────────────────────────────────────────
    // Only cache pages that have results.
    if (songs.length > 0) {
      cache.set(key, result, cache.TTL.ARTIST_SONGS);
    }

    return res.json(result);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("getArtistSongs unexpected error:", {
      error: err.message,
      artistId: req.params.id,
    });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};
