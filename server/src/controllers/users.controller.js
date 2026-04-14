/**
 * server/src/controllers/users.controller.js
 *
 * PRODUCTION READY — All Firestore calls wrapped in retryFirestore() to absorb
 * transient ECONNRESET / socket hang up failures.
 *
 * PHASE 1 — TASK 1.1 changes:
 *   - All res.status(4xx/5xx).json() error calls replaced with AppError throws.
 *   - Controllers call next(err) instead of res.json() for errors.
 *   - All success responses (res.json with data), business logic, retryFirestore
 *     calls, and session pick fire-and-forget pattern: completely untouched.
 *
 * logSessionPicks uses maxAttempts:2 — fire-and-forget telemetry should not
 * accumulate a large retry backlog on persistent failures.
 */

"use strict";

const { db } = require("../config/firebase");
const { getAllUsers } = require("../services/firebase.service");
const { retryFirestore } = require("../utils/retryFirestore");
const logger = require("../utils/logger");
const { ForbiddenError, ValidationError, InternalError } = require("../errors");

// ── GET /users ────────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res, next) => {
  try {
    let users = await getAllUsers(); // retried inside firebase.service
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

    const likedSongIds = userDoc.data().likedSongs ?? [];

    if (likedSongIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const refs = likedSongIds.map((id) => db.collection("songs").doc(id));
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
          const snap = await tx.get(userRef);
          const likedSongs = snap.exists ? (snap.data().likedSongs ?? []) : [];

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

  const today = new Date().toISOString().slice(0, 10);
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
