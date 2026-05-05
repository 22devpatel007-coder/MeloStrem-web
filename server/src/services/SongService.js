'use strict';

const { findOrCreateArtist } = require('../services/artist.service');
const { findOrCreateAlbum }  = require('../services/album.service');
const { Song }               = require('../models/Song');
const { sanitizeSongMeta }   = require('../utils/sanitize');
const logger                 = require('../utils/logger');

const {
  ValidationError,
  NotFoundError,
  ConflictError,
  InternalError,
} = require('../errors');

class SongService {
  /**
   * @param {import('../repositories/SongRepository')} songRepository
   * @param {{ uploadAudio: Function, uploadCover: Function, deleteAsset: Function }} cloudinaryService
   */
  constructor(songRepository, cloudinaryService) {
    if (!songRepository)    throw new Error('SongService: songRepository is required');
    if (!cloudinaryService) throw new Error('SongService: cloudinaryService is required');

    this._repo       = songRepository;
    this._cloudinary = cloudinaryService;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * getSongs(limit, cursor) → { songs, nextCursor, hasMore }
   *
   * Paginated library list. Mirrors GET /api/songs contract exactly.
   *
   * @param {number}      limit
   * @param {string|null} cursor
   * @returns {Promise<{ songs: object[], nextCursor: string|null, hasMore: boolean }>}
   */
  async getSongs(limit = 30, cursor = null) {
    const safeLimit = Math.min(parseInt(limit) || 30, 50);
    try {
      const result = await this._repo.findAll(safeLimit, cursor);
      // findAll returns { items, nextCursor, hasMore } — reshape to API contract
      return {
        songs:      result.items,
        nextCursor: result.nextCursor,
        hasMore:    result.hasMore,
      };
    } catch (err) {
      logger.error('SongService.getSongs error:', { error: err.message });
      throw this._wrapError(err, 'Failed to fetch songs. Please try again.', 'SONGS_FETCH_ERROR');
    }
  }

  /**
   * getSongById(id) → Song object
   *
   * Throws NotFoundError if the song does not exist.
   *
   * @param {string} id
   * @returns {Promise<object>}
   */
  async getSongById(id) {
    this._requireString(id, 'id');
    try {
      const song = await this._repo.findById(id.trim());
      if (!song) throw new NotFoundError('Song not found', 'NOT_FOUND');
      return song;
    } catch (err) {
      if (err.isOperational !== undefined) throw err;
      logger.error('SongService.getSongById error:', { id, error: err.message });
      throw this._wrapError(err, 'Failed to fetch song. Please try again.', 'SONG_FETCH_ERROR');
    }
  }

  /**
   * batchGetSongs(ids) → Song[]
   *
   * Batch fetch for playlist song resolution.
   * Capped at 500 by BaseRepository.batchGet internals.
   * Missing IDs are silently skipped.
   *
   * @param {string[]} ids
   * @returns {Promise<object[]>}
   */
  async batchGetSongs(ids) {
    if (!Array.isArray(ids) || ids.length === 0) {
      throw new ValidationError('ids must be a non-empty array', 'VALIDATION_ERROR');
    }
    const MAX_BATCH = 500;
    if (ids.length > MAX_BATCH) {
      throw new ValidationError(
        `ids batch too large — max ${MAX_BATCH} per request`,
        'VALIDATION_ERROR',
      );
    }
    try {
      return await this._repo.findByIds(ids);
    } catch (err) {
      logger.error('SongService.batchGetSongs error:', { error: err.message });
      throw this._wrapError(err, 'Failed to fetch songs batch.', 'SONGS_BATCH_ERROR');
    }
  }

  /**
   * searchSongs(query, limit) → { songs, total, query }
   *
   * Merged title + artist search. Mirrors GET /api/search contract.
   *
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<{ songs: object[], total: number, query: string }>}
   */
  async searchSongs(query, limit = 20) {
    const safeLimit = Math.min(parseInt(limit) || 20, 50);
    try {
      return await this._repo.search(query, safeLimit);
    } catch (err) {
      logger.error('SongService.searchSongs error:', { query, error: err.message });
      throw this._wrapError(err, 'Search failed. Please try again.', 'SEARCH_ERROR');
    }
  }

  /**
   * checkDuplicate(title, artist, excludeId?) → { duplicate, existing }
   *
   * @param {string}      title
   * @param {string}      artist
   * @param {string|null} [excludeId]
   * @returns {Promise<{ duplicate: boolean, existing: object|null }>}
   */
  async checkDuplicate(title, artist, excludeId = null) {
    if (!title || !artist) {
      throw new ValidationError('title and artist are required', 'VALIDATION_ERROR');
    }
    try {
      const existing = await this._repo.checkDuplicate(title, artist, excludeId);
      return { duplicate: !!existing, existing: existing || null };
    } catch (err) {
      logger.error('SongService.checkDuplicate error:', { error: err.message });
      throw this._wrapError(err, 'Duplicate check failed. Please try again.', 'DUPLICATE_CHECK_ERROR');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * createSong(body, files, uid) → Song object
   *
   * Full upload flow:
   *   1. Sanitize metadata
   *   2. Validate required fields
   *   3. Duplicate check
   *   4. Upload audio + cover to Cloudinary in parallel
   *   5. findOrCreateArtist (best-effort)
   *   6. findOrCreateAlbum  (best-effort)
   *   7. Write to Firestore via SongRepository
   *
   * @param {object}  body  — req.body
   * @param {object}  files — req.files (multer)
   * @param {string}  uid   — req.user.uid
   * @returns {Promise<object>}
   */
  async createSong(body, files, uid) {
    // 1 — Sanitize
    const sanitized = sanitizeSongMeta(body);

    const { title, artist, tags, duration, albumName, trackNumber } = {
      ...body,
      ...sanitized,
    };

    // 2 — Validate
    if (!title || !artist) {
      throw new ValidationError('title and artist are required', 'VALIDATION_ERROR');
    }
    if (!files?.['song']?.[0])  throw new ValidationError('No song file received',  'MISSING_FILE');
    if (!files?.['cover']?.[0]) throw new ValidationError('No cover file received', 'MISSING_FILE');

    // 3 — Duplicate check
    const existingSong = await this._repo.checkDuplicate(title, artist);
    if (existingSong) {
      throw new ConflictError(
        `Song already exists: "${existingSong.title}" by ${existingSong.artist}`,
        'DUPLICATE_SONG',
        { existing: existingSong },
      );
    }

    // 4 — Upload to Cloudinary
    let songResult, coverResult;
    try {
      [songResult, coverResult] = await Promise.all([
        this._cloudinary.uploadAudio(files['song'][0].buffer, {
          folder:    'melostream/songs',
          public_id: `${Date.now()}-${title}`,
        }),
        this._cloudinary.uploadCover(files['cover'][0].buffer, {
          folder:    'melostream/covers',
          public_id: `${Date.now()}-${title}-cover`,
        }),
      ]);
    } catch (err) {
      logger.error('SongService.createSong Cloudinary upload error:', { error: err.message });
      throw new InternalError('File upload failed. Please try again.', 'UPLOAD_ERROR', { originalError: err.message });
    }

    // 5 — Artist linking (best-effort — never blocks upload)
    const artistResult = await findOrCreateArtist(artist);

    // 6 — Album linking (best-effort — only if artist succeeded + albumName provided)
    let albumResult = null;
    if (artistResult && albumName && String(albumName).trim()) {
      albumResult = await findOrCreateAlbum({
        albumName:  String(albumName).trim(),
        artistId:   artistResult.artistId,
        artistName: artistResult.artistName,
        coverUrl:   coverResult.secure_url,
        genre:      '',
        year:       0,
      });
    }

    // 7 — Firestore write
  const now      = new Date();
    const songData = Song.toFirestore({
      title,
      artist,
      tags: Array.isArray(tags) ? tags.slice(0, 10).map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [],
      duration:         Number(duration) || 0,
      fileUrl:          songResult.secure_url,
      coverUrl:         coverResult.secure_url,
      storagePath:      songResult.public_id,
      coverStoragePath: coverResult.public_id,
      playCount:        0,
      featured:         false,
      uploadedBy:       uid,
      createdAt:        now,
      updatedAt:        now,
      artistId:         artistResult ? artistResult.artistId  : null,
      albumId:          albumResult  ? albumResult.albumId    : null,
      album:            albumName    ? String(albumName).trim() : '',
      trackNumber:      trackNumber  ? Number(trackNumber) || null : null,
    }, 'create');

    try {
      const newSong = await this._repo.create(songData);
      return Song.fromFirestore({ ...newSong, createdAt: now.toISOString(), updatedAt: now.toISOString() });
    } catch (err) {
      logger.error('SongService.createSong Firestore write error:', { error: err.message });
      throw this._wrapError(err, 'Failed to save song. Please try again.', 'SONG_CREATE_ERROR');
    }
  }

  /**
   * updateSong(id, body, files) → Song object
   *
   * Edit flow:
   *   1. Fetch existing song (throws NotFoundError if missing)
   *   2. Sanitize metadata
   *   3. Duplicate check (if title or artist changed)
   *   4. Build updates object
   *   5. Artist / album re-linking (best-effort)
   *   6. Optional cover replacement (Cloudinary)
   *   7. Firestore partial update
   *
   * @param {string} id
   * @param {object} body  — req.body
   * @param {object} files — req.files (multer)
   * @returns {Promise<object>}
   */
  async updateSong(id, body, files) {
    this._requireString(id, 'id');

    // 1 — Fetch existing
    const existingSong = await this.getSongById(id);

    // 2 — Sanitize
    const sanitized = sanitizeSongMeta(body);
    // NEW
    const { title, artist, tags, duration, featured, albumName, trackNumber } = {
      ...body,
      ...sanitized,
    };

    const updates = {};

    // 3 — Duplicate check (only if title or artist is changing)
    if (title !== undefined || artist !== undefined) {
      const newTitle  = title  !== undefined ? String(title).trim()  : existingSong.title;
      const newArtist = artist !== undefined ? String(artist).trim() : existingSong.artist;
      const dup = await this._repo.checkDuplicate(newTitle, newArtist, id);
      if (dup) {
        throw new ConflictError(
          `Song already exists: "${dup.title}" by ${dup.artist}`,
          'DUPLICATE_SONG',
          { existing: dup },
        );
      }
    }

    // 4 — Build updates
    if (title    !== undefined) { updates.title    = String(title).trim();  updates.titleLower  = updates.title.toLowerCase(); }
    if (artist   !== undefined) { updates.artist   = String(artist).trim(); updates.artistLower = updates.artist.toLowerCase(); }
    // NEW
    if (tags !== undefined) updates.tags = Array.isArray(tags) ? tags.slice(0, 10).map((t) => String(t).trim().toLowerCase()).filter(Boolean) : [];
    if (duration !== undefined)   updates.duration = Number(duration) || 0;
    if (featured !== undefined)   updates.featured = Boolean(featured);

    // 5 — Artist / album re-linking (best-effort)
    const effectiveArtist = updates.artist || existingSong.artist;

    if (artist !== undefined && updates.artist !== existingSong.artist) {
      const artistResult = await findOrCreateArtist(updates.artist);
      if (artistResult) updates.artistId = artistResult.artistId;
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
            genre:      '',
            year:       0,
          });
          if (albumResult) updates.albumId = albumResult.albumId;
        } else {
          const artistResult = await findOrCreateArtist(effectiveArtist);
          if (artistResult) {
            updates.artistId = artistResult.artistId;
            const albumResult = await findOrCreateAlbum({
              albumName:  trimmedAlbum,
              artistId:   artistResult.artistId,
              artistName: artistResult.artistName,
              coverUrl:   existingSong.coverUrl || '',
              genre:      '',
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

    // 6 — Optional cover replacement
    const coverFile = files?.['cover']?.[0];
    if (coverFile) {
      try {
        const coverResult = await this._cloudinary.uploadCover(coverFile.buffer, {
          folder:    'melostream/covers',
          public_id: `${Date.now()}-${updates.title || existingSong.title}-cover`,
        });
        updates.coverUrl         = coverResult.secure_url;
        updates.coverStoragePath = coverResult.public_id;

        if (existingSong.coverStoragePath) {
          await this._cloudinary.deleteAsset(existingSong.coverStoragePath, { resource_type: 'image' });
        }
      } catch (err) {
        logger.error('SongService.updateSong cover upload error:', { error: err.message });
        throw new InternalError('Cover upload failed. Please try again.', 'UPLOAD_ERROR', { originalError: err.message });
      }
    }

    // 7 — Firestore partial update
    const now      = new Date();
    updates.updatedAt = now;

    try {
      await this._repo.update(id, Song.toFirestore(updates, 'update'));
    } catch (err) {
      logger.error('SongService.updateSong Firestore error:', { id, error: err.message });
      throw this._wrapError(err, 'Failed to update song. Please try again.', 'SONG_UPDATE_ERROR');
    }

    const merged     = { ...existingSong, ...updates };
    merged.updatedAt = now.toISOString();
    merged.createdAt = existingSong.createdAt;
    return merged;
  }

  /**
   * deleteSong(id) → { message }
   *
   * Delete flow:
   *   1. Fetch existing song (throws NotFoundError if missing)
   *   2. Delete audio + cover from Cloudinary (allSettled — never blocks)
   *   3. Delete Firestore document
   *
   * @param {string} id
   * @returns {Promise<{ message: string }>}
   */
  async deleteSong(id) {
    this._requireString(id, 'id');

    // 1 — Fetch existing
    const song = await this.getSongById(id);
    const { storagePath, coverStoragePath } = song;

    // 2 — Cloudinary cleanup (allSettled — failures don't block Firestore delete)
    await Promise.allSettled([
      storagePath      ? this._cloudinary.deleteAsset(storagePath,      { resource_type: 'video' }) : Promise.resolve(),
      coverStoragePath ? this._cloudinary.deleteAsset(coverStoragePath, { resource_type: 'image' }) : Promise.resolve(),
    ]);

    // 3 — Firestore delete
    try {
      await this._repo.delete(id);
    } catch (err) {
      logger.error('SongService.deleteSong Firestore error:', { id, error: err.message });
      throw this._wrapError(err, 'Failed to delete song. Please try again.', 'SONG_DELETE_ERROR');
    }

    return { message: 'Song deleted successfully' };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * _requireString(value, name) — throws ValidationError if value is not a non-empty string
   * @private
   */
  _requireString(value, name) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      throw new ValidationError(`Invalid ${name}`, 'VALIDATION_ERROR');
    }
  }

  /**
   * _wrapError(err, message, code) → AppError
   *
   * Wraps unknown errors into InternalError so the errorHandler always
   * receives a typed AppError. Already-typed AppErrors are re-thrown as-is.
   * @private
   */
  _wrapError(err, message, code) {
    if (err.isOperational !== undefined) return err;
    return new InternalError(message, code, { originalError: err.message });
  }
  
}

module.exports = SongService;