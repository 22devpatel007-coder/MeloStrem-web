/**
 * server/src/controllers/songs.controller.js
 *
 * PHASE 1 — TASK 1.1 changes:
 *   - All inline res.status(4xx/5xx).json() error calls replaced with AppError throws.
 *   - Controllers call next(err) instead of res.json() for errors.
 *   - All success responses, all business logic, Cloudinary calls, artist/album
 *     linking, duplicate checks, cursor pagination: completely untouched.
 *
 * Note on getSongsBatch: uses { success, data } envelope to match its existing
 * contract — this is preserved exactly. Error shape now goes through errorHandler
 * so it will be { success: false, error: { code, message } } — consistent with
 * the unified contract.
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
const logger = require("../utils/logger");
const { db } = require("../config/firebase");
const {
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalError,
} = require("../errors");

// ── POST /songs/batch ──────────────────────────────────────────────────────
// Fetches full Song objects for an array of IDs in one Firestore round-trip.
// Used by PlaylistDetail to load playlist songs without paginated library dependency.
// Body: { ids: string[] }  — max 500 IDs (Firestore getAll limit)
exports.getSongsBatch = async (req, res, next) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return next(
      new ValidationError("ids must be a non-empty array", "VALIDATION_ERROR"),
    );
  }

  const MAX_BATCH = 500;
  if (ids.length > MAX_BATCH) {
    return next(
      new ValidationError(
        `ids batch too large — max ${MAX_BATCH} per request`,
        "VALIDATION_ERROR",
      ),
    );
  }

  try {
    const refs = ids.map((id) => db.collection("songs").doc(String(id).trim()));
    const snaps = await db.getAll(...refs);

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
    logger.error("getSongsBatch error:", { error: err.message });
    return next(
      new InternalError("Failed to fetch songs batch", "INTERNAL_ERROR", {
        originalError: err.message,
      }),
    );
  }
};

// ── GET /songs ─────────────────────────────────────────────────────────────
exports.getAllSongs = async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 50);
    const cursor = req.query.cursor || null;
    const result = await getSongs(limit, cursor);
    return res.json(result);
  } catch (err) {
    logger.error("getAllSongs error:", { error: err.message });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── GET /songs/:id ─────────────────────────────────────────────────────────
exports.getSongById = async (req, res, next) => {
  try {
    const song = await getSongById(req.params.id);
    if (!song) {
      throw new NotFoundError("Song not found", "NOT_FOUND");
    }
    return res.json(song);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("getSongById error:", { error: err.message });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /songs/check-duplicate ────────────────────────────────────────────
exports.checkDuplicate = async (req, res, next) => {
  try {
    const { title, artist, excludeId } = req.body;
    if (!title || !artist) {
      throw new ValidationError(
        "title and artist are required",
        "VALIDATION_ERROR",
      );
    }
    const existing = await checkDuplicateSong(title, artist, excludeId || null);
    if (existing) {
      return res.json({ duplicate: true, existing });
    }
    return res.json({ duplicate: false });
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("checkDuplicate error:", { error: err.message });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── POST /songs ────────────────────────────────────────────────────────────
exports.uploadSong = async (req, res, next) => {
  try {
    const { title, artist, genre, duration, albumName, trackNumber } = req.body;

    if (!title || !artist || !genre) {
      throw new ValidationError(
        "title, artist and genre are required",
        "VALIDATION_ERROR",
      );
    }

    const existing = await checkDuplicateSong(title, artist);
    if (existing) {
      throw new ConflictError(
        `Song already exists: "${existing.title}" by ${existing.artist}`,
        "DUPLICATE_SONG",
        { existing },
      );
    }

    if (!req.files?.["song"]?.[0])
      throw new ValidationError("No song file received", "MISSING_FILE");
    if (!req.files?.["cover"]?.[0])
      throw new ValidationError("No cover file received", "MISSING_FILE");

    const songFile = req.files["song"][0];
    const coverFile = req.files["cover"][0];

    const [songResult, coverResult] = await Promise.all([
      uploadAudio(songFile.buffer, {
        folder: "melostream/songs",
        public_id: `${Date.now()}-${title}`,
      }),
      uploadCover(coverFile.buffer, {
        folder: "melostream/covers",
        public_id: `${Date.now()}-${title}-cover`,
      }),
    ]);

    // ── Artist / Album linking (best-effort — never blocks upload) ────────────
    const artistResult = await findOrCreateArtist(artist);

    let albumResult = null;
    if (artistResult && albumName && String(albumName).trim()) {
      albumResult = await findOrCreateAlbum({
        albumName: String(albumName).trim(),
        artistId: artistResult.artistId,
        artistName: artistResult.artistName,
        coverUrl: coverResult.secure_url,
        genre: genre || "",
        year: 0,
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

    const songData = {
      title,
      artist,
      genre,
      titleLower: title.toLowerCase(),
      artistLower: artist.toLowerCase(),
      duration: Number(duration) || 0,
      fileUrl: songResult.secure_url,
      coverUrl: coverResult.secure_url,
      storagePath: songResult.public_id,
      coverStoragePath: coverResult.public_id,
      playCount: 0,
      featured: false,
      uploadedBy: req.user.uid,
      createdAt: new Date(),
      updatedAt: new Date(),
      artistId: artistResult ? artistResult.artistId : null,
      albumId: albumResult ? albumResult.albumId : null,
      album: albumName ? String(albumName).trim() : "",
      trackNumber: trackNumber ? Number(trackNumber) || null : null,
    };

    const newSong = await createSong(songData);
    newSong.createdAt = songData.createdAt.toISOString();
    newSong.updatedAt = songData.updatedAt.toISOString();

    return res.status(201).json(newSong);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("uploadSong error:", { error: err.message });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── PATCH /songs/:id ───────────────────────────────────────────────────────
exports.updateSong = async (req, res, next) => {
  try {
    const songId = req.params.id;
    const existingSong = await getSongById(songId);

    if (!existingSong) {
      throw new NotFoundError("Song not found", "NOT_FOUND");
    }

    const updates = {};
    const { title, artist, genre, duration, featured, albumName, trackNumber } =
      req.body;

    if (title !== undefined || artist !== undefined) {
      const newTitle =
        title !== undefined ? String(title).trim() : existingSong.title;
      const newArtist =
        artist !== undefined ? String(artist).trim() : existingSong.artist;
      const dup = await checkDuplicateSong(newTitle, newArtist, songId);
      if (dup) {
        throw new ConflictError(
          `Song already exists: "${dup.title}" by ${dup.artist}`,
          "DUPLICATE_SONG",
          { existing: dup },
        );
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
    if (genre !== undefined) updates.genre = String(genre).trim();
    if (duration !== undefined) updates.duration = Number(duration) || 0;
    if (featured !== undefined) updates.featured = Boolean(featured);

    // ── Artist / Album re-linking on edit (best-effort) ───────────────────────
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
            genre: updates.genre || existingSong.genre || "",
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
              genre: updates.genre || existingSong.genre || "",
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
    // ─────────────────────────────────────────────────────────────────────────

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

    return res.json(merged);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("updateSong error:", { error: err.message });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};

// ── DELETE /songs/:id ──────────────────────────────────────────────────────
exports.deleteSong = async (req, res, next) => {
  try {
    const songId = req.params.id;
    const song = await getSongById(songId);

    if (!song) {
      throw new NotFoundError("Song not found", "NOT_FOUND");
    }

    const { storagePath, coverStoragePath } = song;

    await Promise.allSettled([
      storagePath
        ? deleteAsset(storagePath, { resource_type: "video" })
        : Promise.resolve(),
      coverStoragePath
        ? deleteAsset(coverStoragePath, { resource_type: "image" })
        : Promise.resolve(),
    ]);

    await deleteSong(songId);
    return res.json({ message: "Song deleted successfully" });
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error("deleteSong error:", { error: err.message });
    return next(
      new InternalError(
        "Something went wrong. Please try again.",
        "INTERNAL_ERROR",
        { originalError: err.message },
      ),
    );
  }
};
