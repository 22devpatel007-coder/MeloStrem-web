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
 * PHASE 3 — TASK 3.3: Zero Full-Collection Scans
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from previous version (ONLY unbounded-query gaps closed):
 *
 *   getLikedSongs  — added cap: only the first MAX_LIKED_SONGS_FETCH (500)
 *                    IDs from the likedSongs array are fetched via db.getAll().
 *                    The likedSongs array is stored on the user document.
 *                    Firestore documents have a 1 MB size limit, which means
 *                    a likedSongs array can theoretically hold ~10,000–50,000
 *                    song ID strings before hitting the doc limit. db.getAll()
 *                    with thousands of refs sends thousands of parallel read
 *                    requests in one call — risk of connection saturation.
 *                    500 is the safe operational cap:
 *                      • Most users have < 500 liked songs.
 *                      • 500 parallel doc reads is within Firestore's batch
 *                        get throughput without connection pool pressure.
 *                      • If a user exceeds 500 liked songs, the UI should
 *                        implement cursor-based liked song pagination anyway.
 *                    A warning is logged when truncation occurs so engineers
 *                    know when real users are hitting the cap.
 *
 *   toggleLikedSong — added soft warning when likedSongs array exceeds
 *                     LIKED_SONGS_WARN_THRESHOLD (500). Does NOT block the
 *                     like action — toggling still works. The warning surfaces
 *                     in logs so engineers know when pagination is needed.
 *                     Hard block would break UX; soft warning informs ops.
 *
 * Unchanged from previous version:
 *   - getAllUsers: delegates to firebase.service.getAllUsers which now has
 *     its own MAX_USERS_LIMIT cap (Task 3.3 in firebase.service.js).
 *   - toggleLikedSong transaction logic: untouched — only a log warning added.
 *   - logSessionPicks: untouched — already has MAX_PICKS_PER_BATCH = 50 cap.
 *   - All error handling (AppError from Task 1.1): preserved.
 *   - All retryFirestore wrapping: preserved.
 *   - All response shapes: { success, data } — identical.
 */

"use strict";

const { db }             = require("../config/firebase");
const { getAllUsers }    = require("../services/firebase.service");
const { retryFirestore } = require("../utils/retryFirestore");
const logger             = require("../utils/logger");
const { ForbiddenError, ValidationError, InternalError } = require("../errors");

// ── Liked songs caps ──────────────────────────────────────────────────────────
//
// MAX_LIKED_SONGS_FETCH: maximum number of liked song IDs resolved via
//   db.getAll() in a single getLikedSongs request. IDs beyond this cap are
//   silently omitted from the response (a warning is logged). When real users
//   hit this cap consistently, the liked songs feature needs cursor pagination.
//
// LIKED_SONGS_WARN_THRESHOLD: log a warning when a user's liked songs array
//   grows past this size. Does NOT block the toggle action. Signals that
//   pagination is needed before the array causes performance issues.
//
// Both constants match so the warning fires before truncation is reached.
const MAX_LIKED_SONGS_FETCH      = 500;
const LIKED_SONGS_WARN_THRESHOLD = 500;

// ── GET /users ────────────────────────────────────────────────────────────────
// getAllUsers in firebase.service.js now has MAX_USERS_LIMIT = 500 cap.
// No changes needed here — the service layer enforces the cap.
exports.getAllUsers = async (req, res, next) => {
  try {
    let users = await getAllUsers();
    users = users.map((u) => ({ ...u, likedSongs: undefined }));
    return res.json({ success: true, data: users });
  } catch (err) {
    logger.error("getAllUsers error:", { error: err.message });
    return next(
      new InternalError(
        "Failed to fetch users. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── GET /users/:uid/liked-songs ───────────────────────────────────────────────
exports.getLikedSongs = async (req, res, next) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return next(new ForbiddenError("Forbidden", "FORBIDDEN"));
  }

  try {
    const userDoc = await retryFirestore(
      () => db.collection("users").doc(uid).get(),
      { label: "getLikedSongs:userDoc" },
    );

    if (!userDoc.exists) {
      return res.json({ success: true, data: [] });
    }

    const allLikedSongIds = userDoc.data().likedSongs ?? [];

    if (allLikedSongIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    // Task 3.3: cap the number of IDs sent to db.getAll().
    // db.getAll() with thousands of refs sends thousands of parallel Firestore
    // reads in one call — risk of exhausting the Firebase Admin SDK connection
    // pool under concurrent load.
    // If the array exceeds MAX_LIKED_SONGS_FETCH, log a warning and truncate.
    // The truncation is applied to the MOST RECENT liked songs (array head)
    // because likedSongs is appended — newest songs are at the end.
    // We reverse-slice to get the most recently liked 500.
    let likedSongIds = allLikedSongIds;
    if (allLikedSongIds.length > MAX_LIKED_SONGS_FETCH) {
      logger.warn("getLikedSongs: user has more liked songs than fetch cap", {
        uid,
        total:    allLikedSongIds.length,
        cap:      MAX_LIKED_SONGS_FETCH,
        action:   "truncating to most recent songs — liked songs pagination needed",
      });
      // Slice the most recently liked songs (tail of the array = most recent).
      likedSongIds = allLikedSongIds.slice(-MAX_LIKED_SONGS_FETCH);
    }

    const refs  = likedSongIds.map((id) => db.collection("songs").doc(id));
    const snaps = await retryFirestore(() => db.getAll(...refs), {
      label: "getLikedSongs:getAll",
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
    logger.error("getLikedSongs error:", { uid, error: err.message });
    return next(
      new InternalError(
        "Failed to fetch liked songs. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /users/:uid/liked-songs/:songId ──────────────────────────────────────
exports.toggleLikedSong = async (req, res, next) => {
  const { uid, songId } = req.params;

  if (req.user.uid !== uid) {
    return next(new ForbiddenError("Forbidden", "FORBIDDEN"));
  }

  if (!songId) {
    return next(new ValidationError("songId is required", "VALIDATION_ERROR"));
  }

  try {
    const userRef = db.collection("users").doc(uid);

    // Firestore transactions are atomic and idempotent on retry — safe to wrap.
    const updatedList = await retryFirestore(
      () =>
        db.runTransaction(async (tx) => {
          const snap       = await tx.get(userRef);
          const likedSongs = snap.exists ? (snap.data().likedSongs ?? []) : [];

          // Task 3.3: soft warning when array grows past the fetch cap.
          // We do NOT block the like action — that would break UX.
          // The warning tells engineers that this user needs pagination support.
          // Hard limit would be appropriate only if the Firestore document
          // approaches its 1 MB size limit (typically > 50,000 song IDs).
          if (likedSongs.length >= LIKED_SONGS_WARN_THRESHOLD) {
            logger.warn("toggleLikedSong: user liked songs array at or above warn threshold", {
              uid,
              count:  likedSongs.length,
              threshold: LIKED_SONGS_WARN_THRESHOLD,
              action: "liked songs pagination should be implemented",
            });
          }

          const nextList = likedSongs.includes(songId)
            ? likedSongs.filter((id) => id !== songId)
            : [...likedSongs, songId];

          tx.set(userRef, { likedSongs: nextList }, { merge: true });
          return nextList;
        }),
      { label: "toggleLikedSong" },
    );

    return res.json({ success: true, data: updatedList });
  } catch (err) {
    logger.error("toggleLikedSong error:", { uid, songId, error: err.message });
    return next(
      new InternalError(
        "Failed to update liked songs. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /users/:uid/session-picks ────────────────────────────────────────────
// Unchanged — already has MAX_PICKS_PER_BATCH = 50 cap (Task 3.3 compliant).
exports.logSessionPicks = async (req, res, next) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return next(new ForbiddenError("Forbidden", "FORBIDDEN"));
  }

  const { picks } = req.body;

  if (!Array.isArray(picks) || picks.length === 0) {
    return next(
      new ValidationError(
        "picks must be a non-empty array",
        "VALIDATION_ERROR",
      ),
    );
  }

  const MAX_PICKS_PER_BATCH = 50;
  if (picks.length > MAX_PICKS_PER_BATCH) {
    return next(
      new ValidationError(
        `picks batch too large — max ${MAX_PICKS_PER_BATCH} per request`,
        "VALIDATION_ERROR",
      ),
    );
  }

  // Respond immediately — telemetry write is non-blocking from client's perspective.
  res.json({ success: true });

  const sanitized = picks
    .filter((p) => p && typeof p.songId === "string" && p.songId.trim())
    .map((p) => ({
      songId: p.songId.trim(),
      previousSongId:
        typeof p.previousSongId === "string" ? p.previousSongId.trim() : null,
      contextType: ["library", "playlist", "liked", "dynamic"].includes(
        p.contextType,
      )
        ? p.contextType
        : "library",
      contextId: typeof p.contextId === "string" ? p.contextId.trim() : null,
      clientTs: typeof p.ts === "number" ? p.ts : Date.now(),
    }));

  if (!sanitized.length) return;

  const today     = new Date().toISOString().slice(0, 10);
  const sessionId = `${uid}_${today}`;

  try {
    // maxAttempts:2 — fire-and-forget telemetry; one retry is enough.
    // Client already received { success: true } above.
    await retryFirestore(
      () =>
        db
          .collection("users")
          .doc(uid)
          .collection("sessionPicks")
          .add({ sessionId, picks: sanitized, pickedAt: new Date() }),
      { maxAttempts: 2, label: "logSessionPicks" },
    );
  } catch (err) {
    // Non-blocking — client already got success. Log and move on.
    logger.error("logSessionPicks write error:", { uid, error: err.message });
  }
};