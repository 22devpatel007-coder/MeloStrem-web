/**
 * server/src/controllers/playlists.controller.js
 *
 * PHASE 3 — TASK 3.1: In-Memory Cache with TTL
 *
 * Changes from previous version (ONLY cache logic added — nothing else touched):
 *
 *   getPublicAdminPlaylists — cache GET before Firestore; cache SET after fetch.
 *                             Cache key: playlists:admin:public  TTL: 120s (2 min)
 *                             This is the public endpoint hit by every user who
 *                             opens the library/playlist browse page. Same result
 *                             for ALL users — ideal cache candidate.
 *
 *   createAdminPlaylist         — after successful create, invalidate playlists:admin:public
 *   createAdminPlaylistWithCover — same invalidation
 *   deleteAdminPlaylist          — same invalidation
 *
 * NOT cached (deliberately):
 *   getUserPlaylists  — user-scoped data (ownerId filter). Caching would require
 *                       per-user keys and per-user invalidation on every playlist
 *                       mutation. The overhead outweighs the benefit for user lists
 *                       which are typically small (< 50 playlists per user).
 *   getAdminPlaylists — admin-only endpoint used during active admin sessions.
 *                       Admins need to see their mutations reflected immediately.
 *   uploadPlaylistSong — mutation, no cache.
 *
 * Unchanged from previous version:
 *   - All error handling (AppError subclasses from Task 1.1): preserved.
 *   - All success response shapes: identical.
 *   - getUserPlaylists isAdmin filter logic: untouched.
 *   - retryFirestore usage: untouched.
 *   - serializeDoc / serializeSnap helpers: untouched.
 *   - All Cloudinary, createPlaylist, deletePlaylist calls: untouched.
 *
 * Cache safety contract:
 *   - Every cache call is isolated — failure is a miss/no-op, never a crash.
 */

"use strict";

const {
  deletePlaylist,
  createPlaylist,
} = require("../services/firebase.service");
const { checkDuplicateSong } = require("../utils/duplicateCheck");
const {
  uploadAudio,
  uploadCover,
  deleteAsset,
} = require("../services/cloudinary.service");
const { createSong } = require("../services/firebase.service");
const { sendSuccess } = require("../utils/apiResponse");
const { retryFirestore } = require("../utils/retryFirestore");
const cache = require("../services/cache.service");
const logger = require("../utils/logger");
const { db } = require("../config/firebase");
const { playlistService, userRepository } = require("../container");
const {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  InternalError,
} = require("../errors");
const activity = require('../services/activityLogger');
// ── Cache key ─────────────────────────────────────────────────────────────────
// Single key — no variants needed, result is the same for every caller.
const ADMIN_PUBLIC_KEY = "playlists:admin:public";

// ── Helpers ───────────────────────────────────────────────────────────────────
function serializeDoc(id, data) {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate
      ? data.createdAt.toDate().toISOString()
      : (data.createdAt ?? null),
    updatedAt: data.updatedAt?.toDate
      ? data.updatedAt.toDate().toISOString()
      : (data.updatedAt ?? null),
  };
}

function serializeSnap(snap) {
  return snap.docs.map((d) => serializeDoc(d.id, d.data()));
}

// ── GET /api/playlists/admin (public, no auth) ────────────────────────────────
// Cache: playlists:admin:public  TTL: 120s
// Public endpoint — same response for every user, every request.
// At 1000 concurrent users opening the library, this is hit thousands of
// times per minute. 2-minute cache reduces that to 1 Firestore read per 2 min.
exports.getPublicAdminPlaylists = async (req, res, next) => {
  try {
    // ── Cache read ──────────────────────────────────────────────────────────
    const cached = cache.get(ADMIN_PUBLIC_KEY);
    if (cached !== null) {
      return sendSuccess(res, cached);
    }

    // ── Cache miss → Firestore ──────────────────────────────────────────────
    const snap = await retryFirestore(
      () =>
        db
          .collection("playlists")
          .where("isAdmin", "==", true)
          .where("isPublic", "==", true)
          .orderBy("createdAt", "desc")
          .limit(100)
          .get(),
      { label: "getPublicAdminPlaylists" },
    );

    const playlists = serializeSnap(snap);

    // ── Cache write ─────────────────────────────────────────────────────────
    // Cache even when empty — an empty admin playlist list is a valid state.
    // Mutations (create/delete) always invalidate this key immediately.
    cache.set(ADMIN_PUBLIC_KEY, playlists, cache.TTL.PLAYLISTS);

    return sendSuccess(res, playlists);
  } catch (err) {
    logger.error("getPublicAdminPlaylists error:", {
      error: err.message,
      code: err.code,
    });
    return next(
      new InternalError(
        "Could not load library playlists. Please try again.",
        "PLAYLISTS_FETCH_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── GET /api/users/:uid/playlists (protected, verifyToken) ───────────────────
// No cache — user-scoped, must always reflect latest state.
exports.getUserPlaylists = async (req, res, next) => {
  const { uid } = req.params;

  if (req.user.uid !== uid && !req.user.admin) {
    return next(new ForbiddenError("Forbidden", "FORBIDDEN"));
  }

  try {
    const snap = await retryFirestore(
      () =>
        db
          .collection("playlists")
          .where("ownerId", "==", uid)
          .orderBy("createdAt", "desc")
          .limit(200)
          .get(),
      { label: "getUserPlaylists" },
    );

    const playlists = snap.docs
      .filter((d) => d.data().isAdmin !== true)
      .map((d) => serializeDoc(d.id, d.data()));

    return sendSuccess(res, playlists);
  } catch (err) {
    logger.error("getUserPlaylists error:", {
      uid,
      error: err.message,
      code: err.code,
    });
    return next(
      new InternalError(
        "Could not load your playlists. Please try again.",
        "USER_PLAYLISTS_FETCH_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /api/playlists/admin/upload-song ─────────────────────────────────────
// No cache interaction — this uploads a song, not a playlist.
exports.uploadPlaylistSong = async (req, res, next) => {
  try {
    // NEW
    const { title, artist, tags, duration } = req.body;

    if (!title || !artist) {
      throw new ValidationError(
        "title and artist are required",
        "VALIDATION_ERROR",
      );
    }

    const existing = await checkDuplicateSong(title, artist);
    activity.duplicate_check_triggered(req, { title, artist, isDuplicate: !!existing });
    if (existing) {
      return res.json({
        status: "duplicate",
        songId: existing.id,
        existing: {
          id: existing.id,
          title: existing.title,
          artist: existing.artist,
          createdAt: existing.createdAt,
        },
      });
    }

    if (!req.files?.["song"]?.[0])
      throw new ValidationError("No song file received", "MISSING_FILE");
    if (!req.files?.["cover"]?.[0])
      throw new ValidationError("No cover file received", "MISSING_FILE");

    const songFile = req.files["song"][0];
    const coverFile = req.files["cover"][0];

    const uploadTs = Date.now();
    let songResult, coverResult;
    try {
      [songResult, coverResult] = await Promise.all([
        uploadAudio(songFile.buffer, {
          folder: "melostream/songs",
          public_id: `${uploadTs}-${title}`,
        }),
        uploadCover(coverFile.buffer, {
          folder: "melostream/covers",
          public_id: `${uploadTs}-${title}-cover`,
        }),
      ]);
    } catch (uploadErr) {
      if (songResult?.public_id)
        await deleteAsset(songResult.public_id, {
          resource_type: "video",
        }).catch(() => {});
      const isTimeout =
        uploadErr.code === "CLOUDINARY_TIMEOUT" ||
        uploadErr.message?.includes("timed out");
      return next(
        isTimeout
          ? new InternalError(
              "Upload timed out. Try a smaller file or retry.",
              "UPLOAD_TIMEOUT",
              { originalError: uploadErr.message },
            )
          : new InternalError(
              "File upload failed. Please retry.",
              "UPLOAD_FAILED",
              { originalError: uploadErr.message },
            ),
      );
    }

    const songData = {
      title,
      artist,
      tags: Array.isArray(tags)
        ? tags
            .slice(0, 10)
            .map((t) => String(t).trim().toLowerCase())
            .filter(Boolean)
        : [],
      titleLower: title.toLowerCase(),
      artistLower: artist.toLowerCase(),
      duration: Number(duration) || 0,
      audioUrl: songResult.secure_url,
      coverUrl: coverResult.secure_url,
      storagePath: songResult.public_id,
      coverStoragePath: coverResult.public_id,
      playCount: 0,
      featured: false,
      uploadedBy: req.user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const newSong = await createSong(songData);
    return res.status(201).json({
      status: "uploaded",
      songId: newSong.id,
      song: serializeDoc(newSong.id, songData),
    });
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("uploadPlaylistSong error:", { error: err.message });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /api/playlists/admin ─────────────────────────────────────────────────
// Cache invalidation: new admin playlist → public listing is stale.
exports.createAdminPlaylist = async (req, res, next) => {
  try {
    const { name, description, songIds, coverUrl, coverStoragePath } = req.body;

    if (!name || !name.trim()) {
      throw new ValidationError(
        "Playlist name is required",
        "VALIDATION_ERROR",
      );
    }

    let parsedSongIds = songIds;
    if (typeof songIds === "string") {
      try {
        parsedSongIds = JSON.parse(songIds);
      } catch {
        parsedSongIds = [];
      }
    }
    if (!Array.isArray(parsedSongIds) || parsedSongIds.length === 0) {
      throw new ValidationError(
        "At least one song is required",
        "VALIDATION_ERROR",
      );
    }

    const playlistData = {
      name: name.trim(),
      description: (description || "").trim(),
      ownerId: req.user.uid,
      ownerEmail: req.user.email,
      songIds: parsedSongIds,
      coverUrl: coverUrl || "",
      coverStoragePath: coverStoragePath || "",
      coverType: "uploaded",
      isPublic: true,
      isAdmin: true,
      isFeatured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const newPlaylist = await createPlaylist(playlistData);
    newPlaylist.createdAt = playlistData.createdAt.toISOString();
    newPlaylist.updatedAt = playlistData.updatedAt.toISOString();

    // ── Cache invalidation ────────────────────────────────────────────────
    cache.del(ADMIN_PUBLIC_KEY);
    activity.playlist_create(req, { playlistId: newPlaylist.id, name: name.trim() });
    return res.status(201).json(newPlaylist);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("createAdminPlaylist error:", { error: err.message });
    
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /api/playlists/admin/with-cover ──────────────────────────────────────
// Cache invalidation: new admin playlist with cover → public listing is stale.
exports.createAdminPlaylistWithCover = async (req, res, next) => {
  try {
    const { name, description, songIds } = req.body;

    if (!name || !name.trim()) {
      throw new ValidationError(
        "Playlist name is required",
        "VALIDATION_ERROR",
      );
    }

    let parsedSongIds = songIds;
    if (typeof songIds === "string") {
      try {
        parsedSongIds = JSON.parse(songIds);
      } catch {
        parsedSongIds = [];
      }
    }
    if (!Array.isArray(parsedSongIds) || parsedSongIds.length === 0) {
      throw new ValidationError(
        "At least one song is required",
        "VALIDATION_ERROR",
      );
    }

    let coverUrl = "",
      coverStoragePath = "";
    const coverFile = req.files?.["cover"]?.[0];
    if (coverFile) {
      const coverResult = await uploadCover(coverFile.buffer, {
        folder: "melostream/playlist-covers",
        public_id: `${Date.now()}-${name.trim()}-playlist-cover`,
      });
      coverUrl = coverResult.secure_url;
      coverStoragePath = coverResult.public_id;
    } else if (req.body.coverUrl) {
      const rawUrl = req.body.coverUrl;
      // If it's a base64 data URL, upload it to Cloudinary
      if (rawUrl.startsWith("data:")) {
        const coverResult = await uploadCover(rawUrl, {
          folder: "melostream/playlist-covers",
          public_id: `${Date.now()}-${name.trim()}-playlist-cover`,
        });
        coverUrl = coverResult.secure_url;
        coverStoragePath = coverResult.public_id;
      } else {
        // Already a CDN URL — store as-is
        coverUrl = rawUrl;
        coverStoragePath = req.body.coverStoragePath || "";
      }
    }

    const playlistData = {
      name: name.trim(),
      description: (description || "").trim(),
      ownerId: req.user.uid,
      ownerEmail: req.user.email,
      songIds: parsedSongIds,
      coverUrl,
      coverStoragePath,
      coverType: "uploaded",
      isPublic: true,
      isAdmin: true,
      isFeatured: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const newPlaylist = await createPlaylist(playlistData);
    newPlaylist.createdAt = playlistData.createdAt.toISOString();
    newPlaylist.updatedAt = playlistData.updatedAt.toISOString();
    newPlaylist.coverUrl = playlistData.coverUrl;
    newPlaylist.coverStoragePath = playlistData.coverStoragePath;
    // ── Cache invalidation ────────────────────────────────────────────────
    cache.del(ADMIN_PUBLIC_KEY);
    activity.playlist_create(req, { playlistId: newPlaylist.id, name: name.trim(), hasCover: true });
    return res.status(201).json(newPlaylist);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("createAdminPlaylistWithCover error:", { error: err.message });
    
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── GET /api/playlists/admin/all (protected, admin-only) ─────────────────────
// No cache — admin endpoint used during active admin sessions where mutations
// must be immediately visible.
exports.getAdminPlaylists = async (req, res, next) => {
  try {
    const snap = await retryFirestore(
      () =>
        db
          .collection("playlists")
          .where("isAdmin", "==", true)
          .orderBy("createdAt", "desc")
          .limit(200)
          .get(),
      { label: "getAdminPlaylists" },
    );
    return res.json(serializeSnap(snap));
  } catch (err) {
    logger.error("getAdminPlaylists error:", { error: err.message });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── DELETE /api/playlists/admin/:id ──────────────────────────────────────────
// Responds immediately. Song cascade runs fire-and-forget after response.
// Cache invalidation: deleted playlist → public listing is stale.
exports.deleteAdminPlaylist = async (req, res, next) => {
  try {
    const result = await playlistService.deleteAdminPlaylist(
      req.params.id,
      userRepository,
    );

    cache.del(ADMIN_PUBLIC_KEY);
    activity.playlist_delete(req, { playlistId: req.params.id });
    return res.json(result);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("deleteAdminPlaylist error:", { error: err.message });
    
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};
