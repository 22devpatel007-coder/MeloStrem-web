/**
 * server/src/controllers/users.controller.js
 *
 * PRODUCTION READY — No changes from previous version.
 *
 * All Firestore calls are wrapped in retryFirestore() to absorb transient
 * ECONNRESET / socket hang up failures that occur when Render's idle
 * connections are dropped.
 *
 * logSessionPicks uses maxAttempts:2 — fire-and-forget telemetry should not
 * accumulate a large retry backlog on persistent failures.
 */

"use strict";

const { db } = require("../config/firebase");
const { getAllUsers } = require("../services/firebase.service");
const { retryFirestore } = require("../utils/retryFirestore");
const logger = require("../utils/logger");

// ── GET /users ────────────────────────────────────────────────────────────────
exports.getAllUsers = async (req, res) => {
  try {
    let users = await getAllUsers(); // retried inside firebase.service
    users = users.map((u) => ({ ...u, likedSongs: undefined }));
    res.json({ success: true, data: users });
  } catch (err) {
    logger.error("getAllUsers error:", { error: err.message });
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch users. Please try again.",
      });
  }
};

// ── GET /users/:uid/liked-songs ───────────────────────────────────────────────
exports.getLikedSongs = async (req, res) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: "Forbidden" });
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
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch liked songs. Please try again.",
      });
  }
};

// ── POST /users/:uid/liked-songs/:songId ──────────────────────────────────────
exports.toggleLikedSong = async (req, res) => {
  const { uid, songId } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  if (!songId) {
    return res
      .status(400)
      .json({ success: false, message: "songId is required" });
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

    res.json({ success: true, data: updatedList });
  } catch (err) {
    logger.error("toggleLikedSong error:", { uid, songId, error: err.message });
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to update liked songs. Please try again.",
      });
  }
};

// ── POST /users/:uid/session-picks ────────────────────────────────────────────
exports.logSessionPicks = async (req, res) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return res.status(403).json({ success: false, message: "Forbidden" });
  }

  const { picks } = req.body;

  if (!Array.isArray(picks) || picks.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "picks must be a non-empty array" });
  }

  const MAX_PICKS_PER_BATCH = 50;
  if (picks.length > MAX_PICKS_PER_BATCH) {
    return res.status(400).json({
      success: false,
      message: `picks batch too large — max ${MAX_PICKS_PER_BATCH} per request`,
    });
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
