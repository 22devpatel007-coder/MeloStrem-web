/**
 * server/src/controllers/users.controller.js
 *
 * PRODUCTION READY — All Firestore calls wrapped in retryFirestore() to absorb
 * transient ECONNRESET / socket hang up failures.
 *
 * PHASE 1 — TASK 1.1 changes (preserved):
 *   - All res.status(4xx/5xx).json() error calls replaced with AppError throws.
 *   - Controllers call next(err) instead of res.json() for errors.
 *   - All success responses, business logic, retryFirestore calls, and session
 *     pick fire-and-forget pattern: completely untouched.
 *
 * PHASE 3 — TASK 3.3 changes (preserved):
 *   - getLikedSongs: MAX_LIKED_SONGS_FETCH cap (500) on db.getAll() IDs.
 *   - toggleLikedSong: LIKED_SONGS_WARN_THRESHOLD soft warning log.
 *   - getAllUsers: delegates to firebase.service.getAllUsers (capped).
 *
 * PHASE 3 — TASK 3.4: Background Job Queue for Session Picks
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from previous version (ONLY logSessionPicks changed):
 *
 *   logSessionPicks — replaces the direct retryFirestore Firestore write with
 *                     sessionPicksQueue.enqueue(). Everything else is identical:
 *                     - Auth ownership check:  IDENTICAL (req.user.uid !== uid)
 *                     - picks validation:      IDENTICAL (Array check, 50 cap)
 *                     - res.json({ success: true }): IDENTICAL — still fires
 *                       before any write, before enqueue
 *                     - sanitize / sessionId logic: IDENTICAL — same fields,
 *                       same contextType whitelist, same clientTs fallback
 *                     - Error handling for enqueue: not needed — enqueue() is
 *                       synchronous and never throws. If the queue is shut down,
 *                       it logs and discards silently (correct behaviour).
 *
 * WHY enqueue() NEVER needs try/catch:
 *   enqueue() is a synchronous Map.set() with no I/O. It cannot throw an
 *   uncaught async error. The only failure modes (uid cap, shutdown) are
 *   handled inside SessionPicksQueue with logger.warn — not exceptions.
 *   The controller has already sent res.json({ success: true }) before calling
 *   enqueue, so there is no HTTP response to fail regardless.
 *
 * Unchanged from previous version:
 *   - getAllUsers:     completely untouched
 *   - getLikedSongs:  completely untouched
 *   - toggleLikedSong: completely untouched
 *   - All AppError imports and usage: preserved
 *   - All retryFirestore imports and usage: preserved (still used in liked songs)
 */

'use strict';

const { db }              = require('../config/firebase');
const { getAllUsers }     = require('../services/firebase.service');
const { retryFirestore }  = require('../utils/retryFirestore');
const { sessionPicksQueue } = require('../jobs/SessionPicksQueue'); // ← Task 3.4
const logger              = require('../utils/logger');
const { ForbiddenError, ValidationError, InternalError } = require('../errors');

// ── Liked songs caps ──────────────────────────────────────────────────────────
//
// MAX_LIKED_SONGS_FETCH: maximum number of liked song IDs resolved via
//   db.getAll() in a single getLikedSongs request.
//
// LIKED_SONGS_WARN_THRESHOLD: log a warning when a user's liked songs array
//   grows past this size. Does NOT block the toggle action.
//
const MAX_LIKED_SONGS_FETCH      = 500;
const LIKED_SONGS_WARN_THRESHOLD = 500;

// ── GET /users ────────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res, next) => {
  try {
    let users = await getAllUsers();
    users = users.map((u) => ({ ...u, likedSongs: undefined }));
    return res.json({ success: true, data: users });
  } catch (err) {
    logger.error('getAllUsers error:', { error: err.message });
    return next(
      new InternalError(
        'Failed to fetch users. Please try again.',
        'INTERNAL_ERROR',
        { originalError: err.message },
      ),
    );
  }
};

// ── GET /users/:uid/liked-songs ───────────────────────────────────────────────
exports.getLikedSongs = async (req, res, next) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return next(new ForbiddenError('Forbidden', 'FORBIDDEN'));
  }

  try {
    const userDoc = await retryFirestore(
      () => db.collection('users').doc(uid).get(),
      { label: 'getLikedSongs:userDoc' },
    );

    if (!userDoc.exists) {
      return res.json({ success: true, data: [] });
    }

    const allLikedSongIds = userDoc.data().likedSongs ?? [];

    if (allLikedSongIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    let likedSongIds = allLikedSongIds;
    if (allLikedSongIds.length > MAX_LIKED_SONGS_FETCH) {
      logger.warn('getLikedSongs: user has more liked songs than fetch cap', {
        uid,
        total:  allLikedSongIds.length,
        cap:    MAX_LIKED_SONGS_FETCH,
        action: 'truncating to most recent songs — liked songs pagination needed',
      });
      likedSongIds = allLikedSongIds.slice(-MAX_LIKED_SONGS_FETCH);
    }

    const refs  = likedSongIds.map((id) => db.collection('songs').doc(id));
    const snaps = await retryFirestore(() => db.getAll(...refs), {
      label: 'getLikedSongs:getAll',
    });

    const songs = snaps
      .filter((snap) => snap.exists)
      .map((snap) => {
        const data = snap.data();
        return {
          id: snap.id,
          ...data,
          createdAt: data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : (data.createdAt ?? null),
          updatedAt: data.updatedAt?.toDate
            ? data.updatedAt.toDate().toISOString()
            : (data.updatedAt ?? null),
        };
      });

    return res.json({ success: true, data: songs });
  } catch (err) {
    logger.error('getLikedSongs error:', { uid, error: err.message });
    return next(
      new InternalError(
        'Failed to fetch liked songs. Please try again.',
        'INTERNAL_ERROR',
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /users/:uid/liked-songs/:songId ──────────────────────────────────────
exports.toggleLikedSong = async (req, res, next) => {
  const { uid, songId } = req.params;

  if (req.user.uid !== uid) {
    return next(new ForbiddenError('Forbidden', 'FORBIDDEN'));
  }

  if (!songId) {
    return next(new ValidationError('songId is required', 'VALIDATION_ERROR'));
  }

  try {
    const userRef = db.collection('users').doc(uid);

    const updatedList = await retryFirestore(
      () =>
        db.runTransaction(async (tx) => {
          const snap       = await tx.get(userRef);
          const likedSongs = snap.exists ? (snap.data().likedSongs ?? []) : [];

          if (likedSongs.length >= LIKED_SONGS_WARN_THRESHOLD) {
            logger.warn('toggleLikedSong: user liked songs array at or above warn threshold', {
              uid,
              count:     likedSongs.length,
              threshold: LIKED_SONGS_WARN_THRESHOLD,
              action:    'liked songs pagination should be implemented',
            });
          }

          const nextList = likedSongs.includes(songId)
            ? likedSongs.filter((id) => id !== songId)
            : [...likedSongs, songId];

          tx.set(userRef, { likedSongs: nextList }, { merge: true });
          return nextList;
        }),
      { label: 'toggleLikedSong' },
    );

    return res.json({ success: true, data: updatedList });
  } catch (err) {
    logger.error('toggleLikedSong error:', { uid, songId, error: err.message });
    return next(
      new InternalError(
        'Failed to update liked songs. Please try again.',
        'INTERNAL_ERROR',
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /users/:uid/session-picks ────────────────────────────────────────────
//
// PHASE 3 TASK 3.4: Direct Firestore write replaced with sessionPicksQueue.enqueue().
//
// What stays IDENTICAL to the previous version:
//   ✓ Ownership check:         req.user.uid !== uid → ForbiddenError
//   ✓ picks validation:        Array check + empty check → ValidationError
//   ✓ MAX_PICKS_PER_BATCH cap: 50 → ValidationError
//   ✓ Response timing:         res.json({ success: true }) fires FIRST
//                              before any write or enqueue
//   ✓ sanitize logic:          identical field mapping, whitelist, fallbacks
//   ✓ sessionId format:        `${uid}_${YYYY-MM-DD}` unchanged
//   ✓ sanitized.length guard:  if sanitized is empty after filtering, early return
//
// What changed:
//   ✗ Removed:  direct retryFirestore + db.collection('sessionPicks').add()
//   ✓ Added:    sessionPicksQueue.enqueue(uid, sanitized, sessionId)
//
exports.logSessionPicks = async (req, res, next) => {
  const { uid } = req.params;

  // ── Ownership check (unchanged) ───────────────────────────────────────────
  if (req.user.uid !== uid) {
    return next(new ForbiddenError('Forbidden', 'FORBIDDEN'));
  }

  const { picks } = req.body;

  // ── Input validation (unchanged) ─────────────────────────────────────────
  if (!Array.isArray(picks) || picks.length === 0) {
    return next(
      new ValidationError(
        'picks must be a non-empty array',
        'VALIDATION_ERROR',
      ),
    );
  }

  const MAX_PICKS_PER_BATCH = 50;
  if (picks.length > MAX_PICKS_PER_BATCH) {
    return next(
      new ValidationError(
        `picks batch too large — max ${MAX_PICKS_PER_BATCH} per request`,
        'VALIDATION_ERROR',
      ),
    );
  }

  // ── Respond immediately (unchanged) ──────────────────────────────────────
  // Client receives { success: true } before any write or enqueue.
  // This preserves the fire-and-forget contract.
  res.json({ success: true });

  // ── Sanitize picks (unchanged logic) ─────────────────────────────────────
  const sanitized = picks
    .filter((p) => p && typeof p.songId === 'string' && p.songId.trim())
    .map((p) => ({
      songId: p.songId.trim(),
      previousSongId:
        typeof p.previousSongId === 'string' ? p.previousSongId.trim() : null,
      contextType: ['library', 'playlist', 'liked', 'dynamic'].includes(p.contextType)
        ? p.contextType
        : 'library',
      contextId: typeof p.contextId === 'string' ? p.contextId.trim() : null,
      clientTs:  typeof p.ts === 'number' ? p.ts : Date.now(),
    }));

  // Guard: if all picks were filtered out as invalid, nothing to enqueue
  if (!sanitized.length) return;

  // ── Build sessionId (unchanged) ───────────────────────────────────────────
  const today     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const sessionId = `${uid}_${today}`;

  // ── Enqueue — replaces direct Firestore write ─────────────────────────────
  // enqueue() is synchronous (Map.set) and never throws.
  // The SessionPicksQueue drainer writes to Firestore every 5 seconds,
  // batching all pending picks for each uid into one .add() call.
  // Failed writes are retried up to MAX_RETRIES (3) before dead-lettering.
  sessionPicksQueue.enqueue(uid, sanitized, sessionId);
};