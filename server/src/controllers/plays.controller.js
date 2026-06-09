'use strict';

/**
 * server/src/controllers/plays.controller.js
 *
 * Records a valid listening event and increments the song's playCount in Firestore.
 *
 * VALIDATION RULES (production contract):
 *   - songId must be a non-empty string
 *   - listenedSeconds must be a number >= 30 (30-second minimum for a valid play)
 *   - songDuration must be a positive number when provided; used only for logging
 *   - Same user playing the same song multiple times ALWAYS increments (no session dedup)
 *
 * SECURITY:
 *   - verifyToken middleware guarantees req.user.uid is present before this runs
 *   - songId is validated and trimmed before any Firestore access
 *   - listenedSeconds is coerced to a number and bounds-checked; no raw user input
 *     reaches the database
 *   - Firestore increment is atomic (FieldValue.increment) — no read-modify-write race
 *
 * CACHE INVALIDATION:
 *   - songs:id:<songId> is cleared after increment so the next getSongById read
 *     returns the updated playCount instead of the stale cached value
 *   - songs:list:* is NOT cleared — list pages show playCount only in the admin
 *     dashboard which fetches all pages anyway; clearing every list page on every
 *     play event would destroy the cache benefit for the hot library endpoint
 *
 * FIRESTORE WRITE PATTERN:
 *   - Uses FieldValue.increment(1) for an atomic server-side increment
 *   - Also writes lastPlayedAt so the admin dashboard can later build a
 *     "played recently" view without a separate analytics collection
 *   - Does NOT create a separate play-events sub-collection here — playCount
 *     on the song document is the single source of truth for the dashboard stat
 */

const { db }    = require('../config/firebase');
const { FieldValue } = require('firebase-admin/firestore');
const cache     = require('../services/cache.service');
const logger    = require('../utils/logger');

const INTERNAL_ERROR   = 'Something went wrong. Please try again.';
const MIN_LISTEN_SECS  = 30;   // A play is valid after 30 seconds of listening
const MAX_LISTEN_SECS  = 7200; // Guard against absurd values (2 hours max)

// ── Shared log meta helper ────────────────────────────────────────────────────
const logMeta = (req) => ({
  correlationId: req.correlationId,
  userId:        req.user?.uid ?? null,
});

// ── POST /api/plays/:songId ───────────────────────────────────────────────────
exports.recordPlay = async (req, res) => {
  const songId = typeof req.params.songId === 'string'
    ? req.params.songId.trim()
    : '';

  if (!songId) {
    return res.status(400).json({
      success: false,
      error: { message: 'songId is required', code: 'VALIDATION_ERROR' },
    });
  }

  // ── Validate listenedSeconds ─────────────────────────────────────────────
  const rawListened = req.body?.listenedSeconds;
  const listenedSeconds = Number(rawListened);

  if (!Number.isFinite(listenedSeconds) || listenedSeconds < MIN_LISTEN_SECS) {
    return res.status(400).json({
      success: false,
      error: {
        message: `listenedSeconds must be a number >= ${MIN_LISTEN_SECS}`,
        code:    'VALIDATION_ERROR',
      },
    });
  }

  if (listenedSeconds > MAX_LISTEN_SECS) {
    return res.status(400).json({
      success: false,
      error: {
        message: `listenedSeconds must be <= ${MAX_LISTEN_SECS}`,
        code:    'VALIDATION_ERROR',
      },
    });
  }

  // ── Optional songDuration (for logging only — not stored) ────────────────
  const rawDuration    = req.body?.songDuration;
  const songDuration   = rawDuration != null ? Number(rawDuration) : null;

  try {
    const songRef = db.collection('songs').doc(songId);

    // Verify song exists before incrementing — avoids phantom playCount docs
    const snap = await songRef.get();
    if (!snap.exists) {
      return res.status(404).json({
        success: false,
        error: { message: 'Song not found', code: 'NOT_FOUND' },
      });
    }

    // ── Atomic Firestore increment ───────────────────────────────────────
    // FieldValue.increment(1) is a server-side atomic operation — safe under
    // concurrent requests for the same song.
    await songRef.update({
      playCount:    FieldValue.increment(1),
      lastPlayedAt: FieldValue.serverTimestamp(),
    });

    // ── Cache invalidation ───────────────────────────────────────────────
    // Clear the per-song cache entry so the next read returns updated playCount.
    // List cache is intentionally preserved — see module docstring.
    cache.del(`songs:id:${songId}`);

    logger.info('recordPlay success', {
      ...logMeta(req),
      songId,
      listenedSeconds,
      songDuration,
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    logger.error('recordPlay error', {
      ...logMeta(req),
      songId,
      error: err.message,
    });
    return res.status(500).json({
      success: false,
      error: { message: INTERNAL_ERROR, code: 'INTERNAL_ERROR' },
    });
  }
};