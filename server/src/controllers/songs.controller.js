/**
 * server/src/controllers/songs.controller.js
 *
 * PHASE 3 — TASK 3.1: In-Memory Cache with TTL
 * PHASE 4 — TASK 4.1: correlationId added to every logger call.
 *
 * Phase 4 changes (ONLY these — nothing else touched):
 *   Every logger.info / logger.warn / logger.error call now receives
 *   { correlationId: req.correlationId, userId: req.user?.uid ?? null }
 *   as part of its metadata object.
 *
 *   This is the pattern ALL controllers must follow. The correlationId is
 *   set on req by the correlationId middleware (registered in index.js before
 *   all routes). It is always a string — never undefined — by the time any
 *   controller runs.
 *
 *   userId is req.user?.uid (set by verifyToken). For public routes (getAllSongs,
 *   getSongById) req.user is undefined — the ?. guard handles this safely.
 *
 * Phase 3 cache logic (unchanged):
 *   getAllSongs  — cache GET before Firestore; cache SET after successful fetch.
 *                 Cache key: songs:list:<limit>:<cursor|"start">  TTL: 60s
 *   getSongById — cache GET before Firestore; cache SET after successful fetch.
 *                 Cache key: songs:id:<id>  TTL: 300s
 *   uploadSong  — after successful Firestore write, invalidate songs:list:*
 *   updateSong  — after successful update, invalidate songs:list:* + songs:id:<id>
 *   deleteSong  — after successful delete, invalidate songs:list:* + songs:id:<id>
 *
 * Cache safety contract (unchanged):
 *   - Every cache call is isolated in try/catch inside the cache.service.
 *   - A cache read failure = cache miss → falls through to Firestore normally.
 *   - A cache write/invalidation failure = logged, never throws, never blocks.
 *   - Response shape from cache is identical to response shape from Firestore.
 */

"use strict";

const {
  getSongs,
  getSongById,
  createSong,
  updateSong,
  deleteSong,
} = require("../services/firebase.service");
const {
  uploadAudio,
  uploadCover,
  deleteAsset,
} = require("../services/cloudinary.service");
const { checkDuplicateSong } = require("../utils/duplicateCheck");
const { findOrCreateArtist } = require("../services/artist.service");
const { findOrCreateAlbum } = require("../services/album.service");
const { sanitizeSongMeta } = require("../utils/sanitize");
const cache = require("../services/cache.service");
const logger = require("../utils/logger");
const { db } = require("../config/firebase");
const activity = require("../services/activityLogger");

const INTERNAL_ERROR = "Something went wrong. Please try again.";

// ── Cache key builders ────────────────────────────────────────────────────────
// Centralised here so key format is consistent across get/set/invalidate.
// If the format ever changes, update only these two functions.
const cacheKeys = {
  songsList: (limit, cursor) => `songs:list:${limit}:${cursor || "start"}`,
  songById: (id) => `songs:id:${id}`,
  songIds: () => `songs:ids`,
};

// ── Shared log meta helper ────────────────────────────────────────────────────
// Builds the base metadata object every logger call must include.
// Keeps log call sites concise while guaranteeing consistent field names.
//
// Usage:
//   logger.error('getSongsBatch error', { ...logMeta(req), error: err.message });
//
// @param {import('express').Request} req
// @returns {{ correlationId: string, userId: string|null }}
const logMeta = (req) => ({
  correlationId: req.correlationId, // always set by correlationId middleware
  userId: req.user?.uid ?? null, // null for unauthenticated routes
});
// ── GET /songs/ids ─────────────────────────────────────────────────────────
// Returns all song IDs as a lightweight array — no audio/cover fields.
// Used by the frontend shuffle-seed system (sessionStorage-based).
// Cache: songs:ids  TTL: 60s (same as songs list).
// Public read — no auth required. Covered by global generalLimiter.
exports.getSongIds = async (req, res) => {
  const key = cacheKeys.songIds();
  try {
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }
    const SongRepository = require("../repositories/SongRepository");
    const repo = new SongRepository(db);
    const ids = await repo.findAllIds();
    const result = { ids };
    cache.set(key, result, cache.TTL.SONGS_LIST); // reuse 60s TTL
    return res.json(result);
  } catch (err) {
    logger.error("getSongIds error", { ...logMeta(req), error: err.message });
    return res
      .status(500)
      .json({ error: INTERNAL_ERROR, code: "INTERNAL_ERROR" });
  }
};
// ── POST /songs/batch ──────────────────────────────────────────────────────
// No cache — batch lookup is used by playlist pages that need current song data.
// Caching batch results would require invalidating on every song mutation, which
// is expensive and error-prone given arbitrary id combinations.
exports.getSongsBatch = async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "ids must be a non-empty array" });
  }

  const MAX_BATCH = 100;
  if (ids.length > MAX_BATCH) {
    return res.status(400).json({
      success: false,
      message: `ids batch too large — max ${MAX_BATCH} per request`,
    });
  }

  try {
    const refs = ids.map((id) => db.collection("songs").doc(String(id).trim()));
    const snaps = await db.getAll(...refs);

    // NEW — only fields the playlist UI and player actually need
    const songs = snaps
      .filter((snap) => snap.exists)
      .map((snap) => {
        const data = snap.data();
        return {
          id: snap.id,
          title: data.title ?? "",
          artist: data.artist ?? "",
          album: data.album ?? "",
          artistId: data.artistId ?? null,
          albumId: data.albumId ?? null,
          coverUrl: data.coverUrl ?? null,
          duration: data.duration ?? null,
          tags: data.tags ?? [],
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
    logger.error("getSongsBatch error", {
      ...logMeta(req),
      error: err.message,
    });
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch songs batch" });
  }
};

// ── GET /songs ─────────────────────────────────────────────────────────────
// Cache: songs:list:<limit>:<cursor|"start">  TTL: 60s
// At 1000 concurrent users, the first page (no cursor, limit=30) is the hottest
// read in the entire system. 60s cache means ≤1 Firestore read per minute for
// the most common request, regardless of how many users load the library.
exports.getAllSongs = async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 30, 50);
  const cursor = req.query.cursor || null;
  const key = cacheKeys.songsList(limit, cursor);

  try {
    // ── Cache read ──────────────────────────────────────────────────────────
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // ── Cache miss → Firestore ──────────────────────────────────────────────
    const result = await getSongs(limit, cursor);

    // ── Cache write ─────────────────────────────────────────────────────────
    // Only cache when result has songs — empty results may be transient
    // (cold start, emulator, or pagination past the end of the library).
    if (result && Array.isArray(result.songs) && result.songs.length > 0) {
      cache.set(key, result, cache.TTL.SONGS_LIST);
    }

    return res.json(result);
  } catch (err) {
    logger.error("getAllSongs error", { ...logMeta(req), error: err.message });
    return res
      .status(500)
      .json({ error: INTERNAL_ERROR, code: "INTERNAL_ERROR" });
  }
};

// ── GET /songs/:id ─────────────────────────────────────────────────────────
// Cache: songs:id:<id>  TTL: 300s
// Individual song fetches happen on every song row render that needs full
// metadata. 5-minute TTL is safe — song metadata rarely changes mid-session.
exports.getSongById = async (req, res) => {
  const { id } = req.params;
  const key = cacheKeys.songById(id);

  try {
    // ── Cache read ──────────────────────────────────────────────────────────
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // ── Cache miss → Firestore ──────────────────────────────────────────────
    const song = await getSongById(id);
    if (!song)
      return res
        .status(404)
        .json({ error: "Song not found", code: "NOT_FOUND" });

    // ── Cache write ─────────────────────────────────────────────────────────
    cache.set(key, song, cache.TTL.SONG);

    return res.json(song);
  } catch (err) {
    logger.error("getSongById error", { ...logMeta(req), error: err.message });
    return res
      .status(500)
      .json({ error: INTERNAL_ERROR, code: "INTERNAL_ERROR" });
  }
};

// ── POST /songs/check-duplicate ────────────────────────────────────────────
// No cache — duplicate check must always read the latest Firestore state.
// Caching a "no duplicate" result could allow a second admin to upload the
// same song within the TTL window without the duplicate check catching it.
exports.checkDuplicate = async (req, res) => {
  try {
    const { title, artist, excludeId } = req.body;
    if (!title || !artist) {
      return res.status(400).json({
        error: "title and artist are required",
        code: "VALIDATION_ERROR",
      });
    }
    const existing = await checkDuplicateSong(title, artist, excludeId || null);
    if (existing) {
      return res.json({ duplicate: true, existing });
    }
    return res.json({ duplicate: false });
  } catch (err) {
    logger.error("checkDuplicate error", {
      ...logMeta(req),
      error: err.message,
    });
    return res
      .status(500)
      .json({ error: INTERNAL_ERROR, code: "INTERNAL_ERROR" });
  }
};

// ── POST /songs (admin upload) ─────────────────────────────────────────────
// Handles audio + optional cover upload, duplicate check, artist/album
// resolution, and Firestore write. Cache invalidation after success.
exports.uploadSong = async (req, res) => {
  try {
    const sanitized = sanitizeSongMeta(req.body);
    // NEW
    const { title, artist, tags, duration, featured, albumName, trackNumber } =
      {
        ...req.body,
        ...sanitized,
      };

    if (!title || !artist) {
      return res.status(400).json({
        error: "title and artist are required",
        code: "VALIDATION_ERROR",
      });
    }

    const trimmedTitle = String(title).trim();
    const trimmedArtist = String(artist).trim();

    // ── Duplicate check ─────────────────────────────────────────────────────
    const existing = await checkDuplicateSong(
      trimmedTitle,
      trimmedArtist,
      null,
    );
    if (existing) {
      return res.status(409).json({
        error: `Song already exists: "${existing.title}" by ${existing.artist}`,
        code: "DUPLICATE_SONG",
        existing,
      });
    }

    // ── Audio upload (required) ─────────────────────────────────────────────
    const audioFile = req.files?.["song"]?.[0]; // field name must match upload middleware ('song')
    if (!audioFile) {
      return res
        .status(400)
        .json({ error: "audio file is required", code: "VALIDATION_ERROR" });
    }

    const audioResult = await uploadAudio(audioFile.buffer, {
      folder: "melostream/audio",
      public_id: `${Date.now()}-${trimmedTitle}-${trimmedArtist}`,
    });

    // ── Cover upload (optional) ─────────────────────────────────────────────
    let coverUrl = "";
    let coverStoragePath = "";
    const coverFile = req.files?.["cover"]?.[0];
    if (coverFile) {
      const coverResult = await uploadCover(coverFile.buffer, {
        folder: "melostream/covers",
        public_id: `${Date.now()}-${trimmedTitle}-cover`,
      });
      coverUrl = coverResult.secure_url;
      coverStoragePath = coverResult.public_id;
    }

    // ── Artist / album resolution ───────────────────────────────────────────
    let artistId = null;
    let albumId = null;
    let artistResult = null;

    artistResult = await findOrCreateArtist(trimmedArtist);
    if (artistResult) artistId = artistResult.artistId;

    const trimmedAlbum = albumName ? String(albumName).trim() : "";
    if (trimmedAlbum && artistId) {
      const albumResult = await findOrCreateAlbum({
        albumName: trimmedAlbum,
        artistId,
        artistName: artistResult?.artistName || trimmedArtist,
        coverUrl,
        genre: "",
        year: 0,
      });
      if (albumResult) albumId = albumResult.albumId;
    }

    // ── Firestore write ─────────────────────────────────────────────────────
    const songData = await createSong({
      title: trimmedTitle,
      titleLower: trimmedTitle.toLowerCase(),
      artist: trimmedArtist,
      artistLower: trimmedArtist.toLowerCase(),
      artistId,
      album: trimmedAlbum || "",
      albumId,
      // NEW
      tags: Array.isArray(tags)
        ? tags
            .slice(0, 10)
            .map((t) => String(t).trim().toLowerCase())
            .filter(Boolean)
        : [],
      duration: duration ? Number(duration) || 0 : 0,
      featured: featured ? Boolean(featured) : false,
      trackNumber: trackNumber ? Number(trackNumber) || null : null,
      audioUrl: audioResult.secure_url,
      storagePath: audioResult.public_id,
      coverUrl,
      coverStoragePath,
      playCount: 0,
    });

    const newSong = { id: songData.id, ...songData };
    res.locals.songId = newSong.id;
    activity.song_upload(req, {
      songId: newSong.id,
      title: trimmedTitle,
      artist: trimmedArtist,
    });
    newSong.createdAt =
      songData.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString();
    newSong.updatedAt =
      songData.updatedAt?.toDate?.()?.toISOString() ?? new Date().toISOString();

    logger.info("uploadSong success", {
      ...logMeta(req),
      songId: newSong.id,
      title: trimmedTitle,
      artist: trimmedArtist,
    });

    // ── Cache invalidation ──────────────────────────────────────────────────
    // New song means every cached song list page is stale.
    // delPattern clears all keys starting with "songs:list:" atomically.
    // Artist songs cache for this artist is also stale.
    cache.delPattern("songs:list:");
    cache.del(cacheKeys.songIds());
    if (artistResult?.artistId) {
      cache.delPattern(`artists:songs:${artistResult.artistId}:`);
    }

    return res.status(201).json(newSong);
  } catch (err) {
    logger.error("uploadSong error", { ...logMeta(req), error: err.message });
    return res
      .status(500)
      .json({ error: INTERNAL_ERROR, code: "INTERNAL_ERROR" });
  }
};

// ── PATCH /songs/:id (admin update) ───────────────────────────────────────
// Cache invalidation: clear the specific song's cached entry AND all list
// pages (because the song appears in the list and its data has changed).
exports.updateSong = async (req, res) => {
  try {
    const songId = req.params.id;
    const existingSong = await getSongById(songId);
    if (!existingSong)
      return res
        .status(404)
        .json({ error: "Song not found", code: "NOT_FOUND" });

    const sanitized = sanitizeSongMeta(req.body);
    const { title, artist, tags, duration, featured, albumName, trackNumber } =
      {
        ...req.body,
        ...sanitized,
      };

    const updates = {};

    if (title !== undefined || artist !== undefined) {
      const newTitle =
        title !== undefined ? String(title).trim() : existingSong.title;
      const newArtist =
        artist !== undefined ? String(artist).trim() : existingSong.artist;
      const dup = await checkDuplicateSong(newTitle, newArtist, songId);
      if (dup) {
        return res.status(409).json({
          error: `Song already exists: "${dup.title}" by ${dup.artist}`,
          code: "DUPLICATE_SONG",
          existing: dup,
        });
      }
    }

    if (title !== undefined) {
      updates.title = String(title).trim();
      updates.titleLower = updates.title.toLowerCase();
    }
    if (artist !== undefined) {
      updates.artist = String(artist).trim();
      updates.artistLower = updates.artist.toLowerCase();
    }
    // NEW
    if (tags !== undefined)
      updates.tags = Array.isArray(tags)
        ? tags
            .slice(0, 10)
            .map((t) => String(t).trim().toLowerCase())
            .filter(Boolean)
        : [];
    if (duration !== undefined) updates.duration = Number(duration) || 0;
    if (featured !== undefined) updates.featured = Boolean(featured);

    const effectiveArtist = updates.artist || existingSong.artist;

    if (artist !== undefined && updates.artist !== existingSong.artist) {
      const artistResult = await findOrCreateArtist(updates.artist);
      if (artistResult) {
        updates.artistId = artistResult.artistId;
      }
    }

    if (albumName !== undefined) {
      const trimmedAlbum = String(albumName).trim();
      if (trimmedAlbum) {
        const artistIdForAlbum = updates.artistId || existingSong.artistId;

        if (artistIdForAlbum) {
          const albumResult = await findOrCreateAlbum({
            albumName: trimmedAlbum,
            artistId: artistIdForAlbum,
            artistName: effectiveArtist,
            coverUrl: existingSong.coverUrl || "",
            genre: "",
            year: 0,
          });
          if (albumResult) {
            updates.albumId = albumResult.albumId;
          }
        } else {
          const artistResult = await findOrCreateArtist(effectiveArtist);
          if (artistResult) {
            updates.artistId = artistResult.artistId;
            const albumResult = await findOrCreateAlbum({
              albumName: trimmedAlbum,
              artistId: artistResult.artistId,
              artistName: artistResult.artistName,
              coverUrl: existingSong.coverUrl || "",
              genre: "",
              year: 0,
            });
            if (albumResult) updates.albumId = albumResult.albumId;
          }
        }

        updates.album = trimmedAlbum;
      } else {
        updates.album = "";
        updates.albumId = null;
      }
    }

    if (trackNumber !== undefined) {
      updates.trackNumber = trackNumber ? Number(trackNumber) || null : null;
    }

    const coverFile = req.files?.["cover"]?.[0];
    if (coverFile) {
      const coverResult = await uploadCover(coverFile.buffer, {
        folder: "melostream/covers",
        public_id: `${Date.now()}-${updates.title || existingSong.title}-cover`,
      });
      updates.coverUrl = coverResult.secure_url;
      updates.coverStoragePath = coverResult.public_id;

      if (existingSong.coverStoragePath) {
        await deleteAsset(existingSong.coverStoragePath, {
          resource_type: "image",
        });
      }
    }

    updates.updatedAt = new Date();
    await updateSong(songId, updates);

    const merged = { ...existingSong, ...updates };
    merged.updatedAt = updates.updatedAt.toISOString();
    merged.createdAt = existingSong.createdAt;

    logger.info("updateSong success", {
      ...logMeta(req),
      songId,
      updatedFields: Object.keys(updates).filter((k) => k !== "updatedAt"),
    });
    activity.song_edit(req, {
      songId,
      updatedFields: Object.keys(updates).filter((k) => k !== "updatedAt"),
    });

    // ── Cache invalidation ──────────────────────────────────────────────────
    // Song data changed: clear the specific song cache entry.
    // List pages are also stale because they embed song metadata.
    cache.del(cacheKeys.songById(songId));
    cache.delPattern("songs:list:");
    cache.del(cacheKeys.songIds());
    // If albumId changed, album songs cache is stale too.
    const affectedAlbumId = updates.albumId || existingSong.albumId;
    if (affectedAlbumId) {
      cache.del(`albums:songs:${affectedAlbumId}`);
    }
    // If artistId changed, artist songs cache is stale.
    const affectedArtistId = updates.artistId || existingSong.artistId;
    if (affectedArtistId) {
      cache.delPattern(`artists:songs:${affectedArtistId}:`);
    }

    return res.json(merged);
  } catch (err) {
    logger.error("updateSong error", { ...logMeta(req), error: err.message });
    return res
      .status(500)
      .json({ error: INTERNAL_ERROR, code: "INTERNAL_ERROR" });
  }
};

// ── DELETE /songs/:id (admin delete) ──────────────────────────────────────
// Cache invalidation: remove the song entry and all list pages.
exports.deleteSong = async (req, res) => {
  try {
    const songId = req.params.id;
    const song = await getSongById(songId);
    if (!song)
      return res
        .status(404)
        .json({ error: "Song not found", code: "NOT_FOUND" });

    const { storagePath, coverStoragePath, artistId, albumId } = song;

    await Promise.allSettled([
      storagePath
        ? deleteAsset(storagePath, { resource_type: "video" })
        : Promise.resolve(),
      coverStoragePath
        ? deleteAsset(coverStoragePath, { resource_type: "image" })
        : Promise.resolve(),
    ]);

    await deleteSong(songId);

    logger.info("deleteSong success", { ...logMeta(req), songId });
    activity.song_delete(req, { songId });
    // ── Cache invalidation ──────────────────────────────────────────────────
    cache.del(cacheKeys.songById(songId));
    cache.delPattern("songs:list:");
    cache.del(cacheKeys.songIds());
    // Clear album songs cache if this song belonged to an album.
    if (albumId) {
      cache.del(`albums:songs:${albumId}`);
    }
    // Clear artist songs cache if this song belonged to an artist.
    if (artistId) {
      cache.delPattern(`artists:songs:${artistId}:`);
    }

    return res.json({ message: "Song deleted successfully" });
  } catch (err) {
    logger.error("deleteSong error", { ...logMeta(req), error: err.message });
    return res
      .status(500)
      .json({ error: INTERNAL_ERROR, code: "INTERNAL_ERROR" });
  }
};
// ── DELETE /songs/bulk-delete (admin bulk delete) ──────────────────────────
exports.bulkDeleteSongs = async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res
      .status(400)
      .json({ success: false, message: "ids must be a non-empty array" });
  }
  if (ids.length > 100) {
    return res.status(400).json({
      success: false,
      message: "Cannot delete more than 100 songs at once",
    });
  }
  if (!ids.every((id) => typeof id === "string" && id.trim().length > 0)) {
    return res
      .status(400)
      .json({ success: false, message: "All ids must be non-empty strings" });
  }

  try {
    const results = await Promise.allSettled(
      ids.map(async (songId) => {
        const song = await getSongById(songId);
        if (!song) return; // already gone — treat as success
        await Promise.allSettled([
          song.storagePath
            ? deleteAsset(song.storagePath, { resource_type: "video" })
            : Promise.resolve(),
          song.coverStoragePath
            ? deleteAsset(song.coverStoragePath, { resource_type: "image" })
            : Promise.resolve(),
        ]);
        await deleteSong(songId);
        cache.del(cacheKeys.songById(songId));
        if (song.albumId) cache.del(`albums:songs:${song.albumId}`);
        if (song.artistId) cache.delPattern(`artists:songs:${song.artistId}:`);
      }),
    );

    cache.delPattern("songs:list:");

    const failed = results
      .map((r, i) => (r.status === "rejected" ? ids[i] : null))
      .filter(Boolean);

    logger.info("bulkDeleteSongs success", {
      ...logMeta(req),
      requested: ids.length,
      failed: failed.length,
    });
    activity.song_delete(req, {
      songIds: ids,
      bulk: true,
      deleted: ids.length - failed.length,
    });
    return res.json({
      success: true,
      deleted: ids.length - failed.length,
      failed,
    });
  } catch (err) {
    logger.error("bulkDeleteSongs error", {
      ...logMeta(req),
      error: err.message,
    });
    return res.status(500).json({ success: false, message: INTERNAL_ERROR });
  }
};
