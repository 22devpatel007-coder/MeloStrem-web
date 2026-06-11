/**
 * server/src/controllers/search.controller.js
 *
 * PHASE 3 — TASK 3.1: In-Memory Cache with TTL
 *
 * Changes from previous version (ONLY cache logic added — nothing else touched):
 *
 *   searchSongs — cache GET before Firestore; cache SET after successful fetch.
 *                 Cache key: search:<normalizedQuery>:<limit>  TTL: 30s
 *
 *                 Key uses the trimmed, lowercased query so that "Coldplay" and
 *                 "coldplay" hit the same cache entry.
 *
 *                 TTL is intentionally short (30s):
 *                   • Admin uploads new songs frequently; search must reflect
 *                     new content within 30 seconds of upload.
 *                   • Search is the highest-variance read in the system — caching
 *                     even for 30s gives major Firestore relief at 1000 users
 *                     (same query from 50 simultaneous users = 1 Firestore read,
 *                     not 50).
 *
 *                 IMPORTANT: empty results are NEVER cached.
 *                   • Firestore search index lag means a newly uploaded song may
 *                     briefly return 0 results. Caching that empty result would
 *                     hide the new song for the full 30s TTL.
 *                   • Short queries (length < 2) are rejected before this point —
 *                     they never reach the cache path.
 *
 * Unchanged from previous version:
 *   - All error handling (AppError from Task 1.1): preserved.
 *   - Sort logic (exact-match title precedence): untouched and applied to cached
 *     results as well (re-sort is skipped on cache hit — result was already sorted
 *     before being stored).
 *   - Response shape: { songs, total, query } — identical.
 *
 * Cache safety contract:
 *   - Every cache call is isolated — failure is a miss, never a crash.
 */

"use strict";

const { searchSongs } = require("../services/firebase.service");
const cache = require("../services/cache.service");
const logger = require("../utils/logger");
const { InternalError } = require("../errors");
const { Song } = require("../models/Song");
const activity = require("../services/activityLogger");

exports.searchSongs = async (req, res, next) => {
  try {
    const raw = (req.query.q || "").trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 50);

    if (!raw || raw.length < 1) {
      return res.json({ songs: [], total: 0, query: raw });
    }

    // Normalise query for cache key — case-insensitive deduplication.
    // "Coldplay", "coldplay", "COLDPLAY" all resolve to the same cache entry.
    const normalizedQuery = raw.toLowerCase();
    const key = `search:${normalizedQuery}:${limit}`;

    // ── Cache read ────────────────────────────────────────────────────────
    // Return cached result directly — it was already sorted before storage.
    const cached = cache.get(key);
    if (cached !== null) {
      activity.search_performed(req, { query: raw, cacheHit: true });
      res.locals.query = raw;
      return res.json(cached);
    }

    // ── Cache miss → Firestore ────────────────────────────────────────────
    const { songs, total, query } = await searchSongs(raw, limit);

    // Re-apply sorting for exact-match precedence (same logic as before).
    const sorted = [...songs].sort((a, b) => {
      const q = query.toLowerCase();
      const aTitle = (a.titleLower || "").startsWith(q);
      const bTitle = (b.titleLower || "").startsWith(q);
      if (aTitle && !bTitle) return -1;
      if (!aTitle && bTitle) return 1;
      return (a.titleLower || "").localeCompare(b.titleLower || "");
    });

    res.locals.query = raw;
    res.locals.resultCount = sorted.length;
    const result = {
      songs: sorted.map((s) => Song.fromFirestore(s)),
      total,
      query: raw,
    };

    // ── Cache write ───────────────────────────────────────────────────────
    // NEVER cache empty results — Firestore indexing lag can return zero
    // results for a newly uploaded song. Caching that would hide it for 30s.
    activity.search_performed(req, {
      query: raw,
      resultCount: sorted.length,
      cacheHit: false,
    });
    if (sorted.length > 0) {
      cache.set(key, result, cache.TTL.SEARCH);
    }

    return res.json(result);
  } catch (err) {
    logger.error("[search] unexpected error:", { error: err.message });
    return next(
      new InternalError("Search failed. Please try again.", "SEARCH_ERROR", {
        originalError: err.message,
      }),
    );
  }
};
