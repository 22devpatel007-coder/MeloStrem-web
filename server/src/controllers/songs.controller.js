/**
 * server/src/controllers/songs.controller.js
 *
 * PHASE 3 — TASK 3.1: In-Memory Cache with TTL
 *
 * Changes from previous version (ONLY cache logic added — nothing else touched):
 *
 *   getAllSongs  — cache GET before Firestore; cache SET after successful fetch.
 *                 Cache key: songs:list:<limit>:<cursor|"start">  TTL: 60s
 *
 *   getSongById — cache GET before Firestore; cache SET after successful fetch.
 *                 Cache key: songs:id:<id>  TTL: 300s
 *
 *   uploadSong  — after successful Firestore write, invalidate songs:list:* pattern
 *                 so the next library load reflects the new song immediately.
 *
 *   updateSong  — after successful update, invalidate songs:list:* pattern
 *                 AND the specific songs:id:<id> entry.
 *
 *   deleteSong  — after successful delete, invalidate songs:list:* pattern
 *                 AND the specific songs:id:<id> entry.
 *
 * Unchanged from previous version:
 *   - getSongsBatch: no cache — batch endpoint is admin/playlist tool that needs
 *     fresh data; cached batch results would cause stale playlist renders.
 *   - checkDuplicate: no cache — must always read latest Firestore state.
 *   - All success response shapes: identical.
 *   - All error handling: identical (preserved from Tasks 1.1 + 1.2).
 *   - All business logic, Cloudinary calls, findOrCreateArtist/Album: untouched.
 *
 * Cache safety contract:
 *   - Every cache call is isolated in try/catch inside the cache.service.
 *   - A cache read failure = cache miss → falls through to Firestore normally.
 *   - A cache write/invalidation failure = logged, never throws, never blocks.
 *   - Response shape from cache is identical to response shape from Firestore.
 */

'use strict';

const { getSongs, getSongById, createSong, updateSong, deleteSong } = require('../services/firebase.service');
const { uploadAudio, uploadCover, deleteAsset }                     = require('../services/cloudinary.service');
const { checkDuplicateSong }                                        = require('../utils/duplicateCheck');
const { findOrCreateArtist }                                        = require('../services/artist.service');
const { findOrCreateAlbum }                                         = require('../services/album.service');
const { sanitizeSongMeta }                                          = require('../utils/sanitize');
const cache                                                         = require('../services/cache.service');
const logger                                                        = require('../utils/logger');
const { db }                                                        = require('../config/firebase');

const INTERNAL_ERROR = 'Something went wrong. Please try again.';

// ── Cache key builders ────────────────────────────────────────────────────────
// Centralised here so key format is consistent across get/set/invalidate.
// If the format ever changes, update only these two functions.
const cacheKeys = {
  songsList: (limit, cursor) => `songs:list:${limit}:${cursor || 'start'}`,
  songById:  (id)            => `songs:id:${id}`,
};

// ── POST /songs/batch ──────────────────────────────────────────────────────
// No cache — batch lookup is used by playlist pages that need current song data.
// Caching batch results would require invalidating on every song mutation, which
// is expensive and error-prone given arbitrary id combinations.
exports.getSongsBatch = async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids must be a non-empty array' });
  }

  const MAX_BATCH = 50;
  if (ids.length > MAX_BATCH) {
    return res.status(400).json({
      success: false,
      message: `ids batch too large — max ${MAX_BATCH} per request`,
    });
  }

  try {
    const refs  = ids.map((id) => db.collection('songs').doc(String(id).trim()));
    const snaps = await db.getAll(...refs);

    const songs = snaps
      .filter((snap) => snap.exists)
      .map((snap) => {
        const data = snap.data();
        return {
          id:        snap.id,
          ...data,
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
          updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
        };
      });

    return res.json({ success: true, data: songs });
  } catch (err) {
    logger.error('getSongsBatch error:', { error: err.message });
    return res.status(500).json({ success: false, message: 'Failed to fetch songs batch' });
  }
};

// ── GET /songs ─────────────────────────────────────────────────────────────
// Cache: songs:list:<limit>:<cursor|"start">  TTL: 60s
// At 1000 concurrent users, the first page (no cursor, limit=30) is the hottest
// read in the entire system. 60s cache means ≤1 Firestore read per minute for
// the most common request, regardless of how many users load the library.
exports.getAllSongs = async (req, res) => {
  const limit  = Math.min(parseInt(req.query.limit) || 30, 50);
  const cursor = req.query.cursor || null;
  const key    = cacheKeys.songsList(limit, cursor);

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
    logger.error('getAllSongs error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

// ── GET /songs/:id ─────────────────────────────────────────────────────────
// Cache: songs:id:<id>  TTL: 300s
// Individual song fetches happen on every song row render that needs full
// metadata. 5-minute TTL is safe — song metadata rarely changes mid-session.
exports.getSongById = async (req, res) => {
  const { id } = req.params;
  const key    = cacheKeys.songById(id);

  try {
    // ── Cache read ──────────────────────────────────────────────────────────
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    // ── Cache miss → Firestore ──────────────────────────────────────────────
    const song = await getSongById(id);
    if (!song) return res.status(404).json({ error: 'Song not found', code: 'NOT_FOUND' });

    // ── Cache write ─────────────────────────────────────────────────────────
    cache.set(key, song, cache.TTL.SONG);

    return res.json(song);
  } catch (err) {
    logger.error('getSongById error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
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
      return res.status(400).json({ error: 'title and artist are required', code: 'VALIDATION_ERROR' });
    }
    const existing = await checkDuplicateSong(title, artist, excludeId || null);
    if (existing) {
      return res.json({ duplicate: true, existing });
    }
    return res.json({ duplicate: false });
  } catch (err) {
    logger.error('checkDuplicate error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

// ── POST /songs (admin upload) ─────────────────────────────────────────────
// Cache invalidation: after a successful upload, all songs:list:* pages are
// stale because the new song will appear in the library. We clear every
// cached page so the next GET /api/songs fetches fresh data from Firestore.
exports.uploadSong = async (req, res) => {
  try {
    const sanitized = sanitizeSongMeta(req.body);
    const { title, artist, genre, duration, albumName, trackNumber } = {
      ...req.body,
      ...sanitized,
    };

    if (!title || !artist || !genre) {
      return res.status(400).json({ error: 'title, artist and genre are required', code: 'VALIDATION_ERROR' });
    }

    const existing = await checkDuplicateSong(title, artist);
    if (existing) {
      return res.status(409).json({
        error: `Song already exists: "${existing.title}" by ${existing.artist}`,
        code: 'DUPLICATE_SONG',
        existing,
      });
    }

    if (!req.files?.['song']?.[0])  return res.status(400).json({ error: 'No song file received',  code: 'MISSING_FILE' });
    if (!req.files?.['cover']?.[0]) return res.status(400).json({ error: 'No cover file received', code: 'MISSING_FILE' });

    const songFile  = req.files['song'][0];
    const coverFile = req.files['cover'][0];

    const [songResult, coverResult] = await Promise.all([
      uploadAudio(songFile.buffer, {
        folder:    'melostream/songs',
        public_id: `${Date.now()}-${title}`,
      }),
      uploadCover(coverFile.buffer, {
        folder:    'melostream/covers',
        public_id: `${Date.now()}-${title}-cover`,
      }),
    ]);

    const artistResult = await findOrCreateArtist(artist);

    let albumResult = null;
    if (artistResult && albumName && String(albumName).trim()) {
      albumResult = await findOrCreateAlbum({
        albumName:  String(albumName).trim(),
        artistId:   artistResult.artistId,
        artistName: artistResult.artistName,
        coverUrl:   coverResult.secure_url,
        genre:      genre || '',
        year:       0,
      });
    }

    const songData = {
      title,
      artist,
      genre,
      titleLower:       title.toLowerCase(),
      artistLower:      artist.toLowerCase(),
      duration:         Number(duration) || 0,
      fileUrl:          songResult.secure_url,
      coverUrl:         coverResult.secure_url,
      storagePath:      songResult.public_id,
      coverStoragePath: coverResult.public_id,
      playCount:        0,
      featured:         false,
      uploadedBy:       req.user.uid,
      createdAt:        new Date(),
      updatedAt:        new Date(),
      artistId:         artistResult ? artistResult.artistId    : null,
      albumId:          albumResult  ? albumResult.albumId      : null,
      album:            albumName    ? String(albumName).trim() : '',
      trackNumber:      trackNumber  ? Number(trackNumber) || null : null,
    };

    const newSong = await createSong(songData);
    newSong.createdAt = songData.createdAt.toISOString();
    newSong.updatedAt = songData.updatedAt.toISOString();

    // ── Cache invalidation ──────────────────────────────────────────────────
    // New song means every cached song list page is stale.
    // delPattern clears all keys starting with "songs:list:" atomically.
    // Artist songs cache for this artist is also stale.
    cache.delPattern('songs:list:');
    if (artistResult?.artistId) {
      cache.delPattern(`artists:songs:${artistResult.artistId}:`);
    }

    return res.status(201).json(newSong);
  } catch (err) {
    logger.error('uploadSong error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

// ── PATCH /songs/:id (admin update) ───────────────────────────────────────
// Cache invalidation: clear the specific song's cached entry AND all list
// pages (because the song appears in the list and its data has changed).
exports.updateSong = async (req, res) => {
  try {
    const songId       = req.params.id;
    const existingSong = await getSongById(songId);
    if (!existingSong) return res.status(404).json({ error: 'Song not found', code: 'NOT_FOUND' });

    const sanitized = sanitizeSongMeta(req.body);
    const { title, artist, genre, duration, featured, albumName, trackNumber } = {
      ...req.body,
      ...sanitized,
    };

    const updates = {};

    if (title !== undefined || artist !== undefined) {
      const newTitle  = title  !== undefined ? String(title).trim()  : existingSong.title;
      const newArtist = artist !== undefined ? String(artist).trim() : existingSong.artist;
      const dup = await checkDuplicateSong(newTitle, newArtist, songId);
      if (dup) {
        return res.status(409).json({
          error: `Song already exists: "${dup.title}" by ${dup.artist}`,
          code:  'DUPLICATE_SONG',
          existing: dup,
        });
      }
    }

    if (title    !== undefined) { updates.title    = String(title).trim();   updates.titleLower  = updates.title.toLowerCase(); }
    if (artist   !== undefined) { updates.artist   = String(artist).trim();  updates.artistLower = updates.artist.toLowerCase(); }
    if (genre    !== undefined)   updates.genre    = String(genre).trim();
    if (duration !== undefined)   updates.duration = Number(duration) || 0;
    if (featured !== undefined)   updates.featured = Boolean(featured);

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
            albumName:  trimmedAlbum,
            artistId:   artistIdForAlbum,
            artistName: effectiveArtist,
            coverUrl:   existingSong.coverUrl || '',
            genre:      updates.genre || existingSong.genre || '',
            year:       0,
          });
          if (albumResult) {
            updates.albumId = albumResult.albumId;
          }
        } else {
          const artistResult = await findOrCreateArtist(effectiveArtist);
          if (artistResult) {
            updates.artistId = artistResult.artistId;
            const albumResult = await findOrCreateAlbum({
              albumName:  trimmedAlbum,
              artistId:   artistResult.artistId,
              artistName: artistResult.artistName,
              coverUrl:   existingSong.coverUrl || '',
              genre:      updates.genre || existingSong.genre || '',
              year:       0,
            });
            if (albumResult) updates.albumId = albumResult.albumId;
          }
        }

        updates.album = trimmedAlbum;
      } else {
        updates.album   = '';
        updates.albumId = null;
      }
    }

    if (trackNumber !== undefined) {
      updates.trackNumber = trackNumber ? Number(trackNumber) || null : null;
    }

    const coverFile = req.files?.['cover']?.[0];
    if (coverFile) {
      const coverResult = await uploadCover(coverFile.buffer, {
        folder:    'melostream/covers',
        public_id: `${Date.now()}-${updates.title || existingSong.title}-cover`,
      });
      updates.coverUrl         = coverResult.secure_url;
      updates.coverStoragePath = coverResult.public_id;

      if (existingSong.coverStoragePath) {
        await deleteAsset(existingSong.coverStoragePath, { resource_type: 'image' });
      }
    }

    updates.updatedAt = new Date();
    await updateSong(songId, updates);

    const merged     = { ...existingSong, ...updates };
    merged.updatedAt = updates.updatedAt.toISOString();
    merged.createdAt = existingSong.createdAt;

    // ── Cache invalidation ──────────────────────────────────────────────────
    // Song data changed: clear the specific song cache entry.
    // List pages are also stale because they embed song metadata.
    cache.del(cacheKeys.songById(songId));
    cache.delPattern('songs:list:');
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
    logger.error('updateSong error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

// ── DELETE /songs/:id (admin delete) ──────────────────────────────────────
// Cache invalidation: remove the song entry and all list pages.
exports.deleteSong = async (req, res) => {
  try {
    const songId = req.params.id;
    const song   = await getSongById(songId);
    if (!song) return res.status(404).json({ error: 'Song not found', code: 'NOT_FOUND' });

    const { storagePath, coverStoragePath, artistId, albumId } = song;

    await Promise.allSettled([
      storagePath      ? deleteAsset(storagePath,      { resource_type: 'video' }) : Promise.resolve(),
      coverStoragePath ? deleteAsset(coverStoragePath, { resource_type: 'image' }) : Promise.resolve(),
    ]);

    await deleteSong(songId);

    // ── Cache invalidation ──────────────────────────────────────────────────
    cache.del(cacheKeys.songById(songId));
    cache.delPattern('songs:list:');
    // Clear album songs cache if this song belonged to an album.
    if (albumId) {
      cache.del(`albums:songs:${albumId}`);
    }
    // Clear artist songs cache if this song belonged to an artist.
    if (artistId) {
      cache.delPattern(`artists:songs:${artistId}:`);
    }

    return res.json({ message: 'Song deleted successfully' });
  } catch (err) {
    logger.error('deleteSong error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};