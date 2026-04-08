const { getSongs, getSongById, createSong, updateSong, deleteSong } = require('../services/firebase.service');
const { uploadAudio, uploadCover, deleteAsset } = require('../services/cloudinary.service');
const { checkDuplicateSong } = require('../utils/duplicateCheck');
const { findOrCreateArtist } = require('../services/artist.service');
const { findOrCreateAlbum } = require('../services/album.service');
const logger = require('../utils/logger');

// Single canonical db import — see comment in original file for why only one import.
const { db } = require('../config/firebase');

const INTERNAL_ERROR = 'Something went wrong. Please try again.';

// ── POST /songs/batch ──────────────────────────────────────────────────────
// Fetches full Song objects for an array of IDs in one Firestore round-trip.
// Used by PlaylistDetail to load playlist songs without paginated library dependency.
// Body: { ids: string[] }  — max 500 IDs (Firestore getAll limit)
exports.getSongsBatch = async (req, res) => {
  const { ids } = req.body;

  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ success: false, message: 'ids must be a non-empty array' });
  }

  const MAX_BATCH = 500;
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

exports.getAllSongs = async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 30, 50);
    const cursor = req.query.cursor || null;
    const result = await getSongs(limit, cursor);
    return res.json(result);
  } catch (err) {
    logger.error('getAllSongs error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

exports.getSongById = async (req, res) => {
  try {
    const song = await getSongById(req.params.id);
    if (!song) return res.status(404).json({ error: 'Song not found', code: 'NOT_FOUND' });
    return res.json(song);
  } catch (err) {
    logger.error('getSongById error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

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

exports.uploadSong = async (req, res) => {
  try {
    const { title, artist, genre, duration, albumName, trackNumber } = req.body;

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

    // ── Artist / Album linking (best-effort — never blocks upload) ────────────
    // findOrCreateArtist and findOrCreateAlbum both return null on failure
    // without throwing. If either returns null, the song is still saved with
    // the plain text artist/album fields intact — no data is lost.
    const artistResult = await findOrCreateArtist(artist);

    let albumResult = null;
    if (artistResult && albumName && String(albumName).trim()) {
      albumResult = await findOrCreateAlbum({
        albumName:  String(albumName).trim(),
        artistId:   artistResult.artistId,
        artistName: artistResult.artistName,
        coverUrl:   coverResult.secure_url,
        genre:      genre || '',
        year:       0, // future: parse from form field if added
      });
    }
    // ─────────────────────────────────────────────────────────────────────────

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
      // New fields — additive only, never break existing consumers
      // null when artist/album service failed (e.g. Firestore down); consumers
      // must treat null as "no link" and fall back to plain text display.
      artistId:         artistResult ? artistResult.artistId   : null,
      albumId:          albumResult  ? albumResult.albumId     : null,
      album:            albumName    ? String(albumName).trim() : '',
      trackNumber:      trackNumber  ? Number(trackNumber) || null : null,
    };

    const newSong = await createSong(songData);
    newSong.createdAt = songData.createdAt.toISOString();
    newSong.updatedAt = songData.updatedAt.toISOString();

    return res.status(201).json(newSong);
  } catch (err) {
    logger.error('uploadSong error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

exports.updateSong = async (req, res) => {
  try {
    const songId       = req.params.id;
    const existingSong = await getSongById(songId);
    if (!existingSong) return res.status(404).json({ error: 'Song not found', code: 'NOT_FOUND' });

    const updates = {};
    const { title, artist, genre, duration, featured, albumName, trackNumber } = req.body;

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

    // ── Artist / Album re-linking on edit (best-effort) ───────────────────────
    // Re-run find-or-create whenever artist name or album name changes.
    // The effective artist name after this update (may not have changed).
    const effectiveArtist = updates.artist || existingSong.artist;

    // Artist re-link: only when artist field is being updated to a new value.
    if (artist !== undefined && updates.artist !== existingSong.artist) {
      const artistResult = await findOrCreateArtist(updates.artist);
      if (artistResult) {
        updates.artistId = artistResult.artistId;
      }
    }

    // Album re-link: whenever albumName is explicitly provided in the edit payload.
    if (albumName !== undefined) {
      const trimmedAlbum = String(albumName).trim();
      if (trimmedAlbum) {
        // Use the updated artistId if we just computed one, otherwise fall back
        // to the song's existing artistId (which may be null for pre-migration songs).
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
          // artistId still null (pre-migration song being partially updated):
          // compute artist first so album can link correctly.
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
        // Empty string sent — clear album link
        updates.album   = '';
        updates.albumId = null;
      }
    }

    if (trackNumber !== undefined) {
      updates.trackNumber = trackNumber ? Number(trackNumber) || null : null;
    }
    // ─────────────────────────────────────────────────────────────────────────

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

    return res.json(merged);
  } catch (err) {
    logger.error('updateSong error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};

exports.deleteSong = async (req, res) => {
  try {
    const songId = req.params.id;
    const song   = await getSongById(songId);
    if (!song) return res.status(404).json({ error: 'Song not found', code: 'NOT_FOUND' });

    const { storagePath, coverStoragePath } = song;

    await Promise.allSettled([
      storagePath      ? deleteAsset(storagePath,      { resource_type: 'video' }) : Promise.resolve(),
      coverStoragePath ? deleteAsset(coverStoragePath, { resource_type: 'image' }) : Promise.resolve(),
    ]);

    await deleteSong(songId);
    return res.json({ message: 'Song deleted successfully' });
  } catch (err) {
    logger.error('deleteSong error:', { error: err.message });
    return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
  }
};