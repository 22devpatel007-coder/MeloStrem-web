/**
 * server/src/services/PlaylistService.js
 *
 * Phase 2 — Task 2.3: Service Layer OOP Refactor
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL business logic for the playlists domain.
 * Mirrors the exact behaviour of playlists.controller.js but as a testable class.
 *
 * Constructor dependencies (injected via container.js):
 *   playlistRepository — PlaylistRepository instance
 *   songRepository     — SongRepository instance (for batch song resolution)
 *   cloudinaryService  — { uploadCover, deleteAsset } (for playlist cover uploads)
 *
 * Methods:
 *   getPublicAdminPlaylists()                     — public admin playlist listing
 *   getUserPlaylists(uid)                         — user-owned playlists
 *   getAdminPlaylists()                           — admin: all admin playlists
 *   createAdminPlaylist(data, uid, userEmail)     — create playlist (no cover upload)
 *   createAdminPlaylistWithCover(data, files, uid, userEmail) — create with cover
 *   uploadPlaylistSong(body, files, uid)          — upload song into playlist flow
 *   deleteAdminPlaylist(id)                       — delete playlist + Cloudinary cover
 *
 * Error contract:
 *   All methods throw AppError subclasses.
 *   Controllers catch and pass to next(err).
 *
 * Design notes:
 *   - uploadPlaylistSong keeps its existing behaviour: calls firebase.service
 *     createSong directly (not SongService.createSong) to preserve the exact
 *     song-in-playlist upload flow with duplicate detection that already works.
 *   - getUserPlaylists filters isAdmin !== true in application code, same as the
 *     original controller (this is the FIXED behaviour — not a regression).
 *   - serializeDoc/serializeSnap helpers are inlined for clarity.
 */

'use strict';

const { checkDuplicateSong }                    = require('../utils/duplicateCheck');
const { uploadAudio, uploadCover, deleteAsset } = require('../services/cloudinary.service');
const { createSong, createPlaylist, deletePlaylist } = require('../services/firebase.service');
const logger                                    = require('../utils/logger');
const {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  InternalError,
} = require('../errors');

class PlaylistService {
  /**
   * @param {import('../repositories/PlaylistRepository')} playlistRepository
   * @param {import('../repositories/SongRepository')}     songRepository
   */
  constructor(playlistRepository, songRepository) {
    if (!playlistRepository) throw new Error('PlaylistService: playlistRepository is required');
    if (!songRepository)     throw new Error('PlaylistService: songRepository is required');

    this._playlistRepo = playlistRepository;
    this._songRepo     = songRepository;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * getPublicAdminPlaylists() → Playlist[]
   *
   * Public endpoint — no auth required.
   * Returns all playlists where isAdmin=true AND isPublic=true, ordered by createdAt DESC.
   *
   * @returns {Promise<object[]>}
   */
  async getPublicAdminPlaylists() {
    try {
      // PlaylistRepository.findAllPublic() queries isPublic=true.
      // Filter isAdmin=true in application code to match original controller query
      // which had both filters: isAdmin==true AND isPublic==true.
      const playlists = await this._playlistRepo.findAllPublic();
      return playlists.filter((p) => p.isAdmin === true);
    } catch (err) {
      logger.error('PlaylistService.getPublicAdminPlaylists error:', { error: err.message });
      throw this._wrapError(err, 'Could not load library playlists. Please try again.', 'PLAYLISTS_FETCH_ERROR');
    }
  }

  /**
   * getUserPlaylists(uid) → Playlist[]
   *
   * Returns all playlists owned by the user, excluding isAdmin=true playlists.
   * This is the FIXED version — original controller removed the Firestore
   * isAdmin==false filter (which caused missing playlists) and filters in app code.
   *
   * @param {string} uid
   * @returns {Promise<object[]>}
   */
  async getUserPlaylists(uid) {
    try {
      // PlaylistRepository.findByUserId queries by ownerId field.
      // Original controller used 'ownerId' field — repository matches that.
      const playlists = await this._playlistRepo.findByUserId(uid);
      // Filter out admin library playlists — same as original controller fix.
      return playlists.filter((p) => p.isAdmin !== true);
    } catch (err) {
      logger.error('PlaylistService.getUserPlaylists error:', { uid, error: err.message });
      throw this._wrapError(err, 'Could not load your playlists. Please try again.', 'USER_PLAYLISTS_FETCH_ERROR');
    }
  }

  /**
   * getAdminPlaylists() → Playlist[]
   *
   * Admin-only. Returns ALL admin playlists (public and non-public).
   * Used by the admin management view.
   *
   * @returns {Promise<object[]>}
   */
  async getAdminPlaylists() {
    try {
      // All playlists where isAdmin=true — use repository's base query
      // Original controller queried: .where('isAdmin', '==', true).orderBy('createdAt', 'desc')
      // We replicate via findAllPublic + filter, but since admin view needs ALL
      // (public + private), we use findByUserId fallback or add a dedicated method.
      // Since PlaylistRepository doesn't have findAllAdmin, call _callFirestore via
      // the existing pattern — use playlistRepository.executeWithRetry for custom queries.
      const playlists = await this._playlistRepo.executeWithRetry(async () => {
        const snap = await this._playlistRepo._db
          .collection('playlists')
          .where('isAdmin', '==', true)
          .orderBy('createdAt', 'desc')
          .get();
        return snap.docs.map((doc) => this._playlistRepo.formatDoc(doc));
      }, 'getAdminPlaylists');
      return playlists;
    } catch (err) {
      logger.error('PlaylistService.getAdminPlaylists error:', { error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * createAdminPlaylist(body, uid, userEmail) → Playlist
   *
   * Creates an admin playlist without a cover file upload.
   * Cover URL is expected to be pre-uploaded and passed in body.
   *
   * @param {object} body
   * @param {string} uid
   * @param {string} userEmail
   * @returns {Promise<object>}
   */
  async createAdminPlaylist(body, uid, userEmail) {
    const { name, description, songIds, coverUrl, coverStoragePath } = body;

    if (!name || !name.trim()) {
      throw new ValidationError('Playlist name is required', 'VALIDATION_ERROR');
    }

    const parsedSongIds = this._parseSongIds(songIds);

    const now          = new Date();
    const playlistData = {
      name:             name.trim(),
      description:      (description || '').trim(),
      ownerId:          uid,
      ownerEmail:       userEmail,
      songIds:          parsedSongIds,
      coverUrl:         coverUrl || '',
      coverStoragePath: coverStoragePath || '',
      coverType:        'uploaded',
      isPublic:         true,
      isAdmin:          true,
      isFeatured:       false,
      createdAt:        now,
      updatedAt:        now,
    };

    try {
      const newPlaylist      = await createPlaylist(playlistData);
      newPlaylist.createdAt  = now.toISOString();
      newPlaylist.updatedAt  = now.toISOString();
      return newPlaylist;
    } catch (err) {
      logger.error('PlaylistService.createAdminPlaylist error:', { error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  /**
   * createAdminPlaylistWithCover(body, files, uid, userEmail) → Playlist
   *
   * Creates an admin playlist and uploads the cover file to Cloudinary first.
   *
   * @param {object} body
   * @param {object} files   — req.files (multer)
   * @param {string} uid
   * @param {string} userEmail
   * @returns {Promise<object>}
   */
  async createAdminPlaylistWithCover(body, files, uid, userEmail) {
    const { name, description, songIds } = body;

    if (!name || !name.trim()) {
      throw new ValidationError('Playlist name is required', 'VALIDATION_ERROR');
    }

    const parsedSongIds = this._parseSongIds(songIds);

    let coverUrl = '', coverStoragePath = '';
    const coverFile = files?.['cover']?.[0];
    if (coverFile) {
      try {
        const coverResult = await uploadCover(coverFile.buffer, {
          folder:    'melostream/playlist-covers',
          public_id: `${Date.now()}-${name.trim()}-playlist-cover`,
        });
        coverUrl         = coverResult.secure_url;
        coverStoragePath = coverResult.public_id;
      } catch (err) {
        logger.error('PlaylistService.createAdminPlaylistWithCover upload error:', { error: err.message });
        throw new InternalError('Cover upload failed. Please try again.', 'UPLOAD_ERROR', { originalError: err.message });
      }
    }

    const now          = new Date();
    const playlistData = {
      name:             name.trim(),
      description:      (description || '').trim(),
      ownerId:          uid,
      ownerEmail:       userEmail,
      songIds:          parsedSongIds,
      coverUrl,
      coverStoragePath,
      coverType:        'uploaded',
      isPublic:         true,
      isAdmin:          true,
      isFeatured:       false,
      createdAt:        now,
      updatedAt:        now,
    };

    try {
      const newPlaylist      = await createPlaylist(playlistData);
      newPlaylist.createdAt  = now.toISOString();
      newPlaylist.updatedAt  = now.toISOString();
      return newPlaylist;
    } catch (err) {
      logger.error('PlaylistService.createAdminPlaylistWithCover Firestore error:', { error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  /**
   * uploadPlaylistSong(body, files, uid) → { status, songId, song } | { status: 'duplicate', ... }
   *
   * Preserves the exact flow from playlists.controller.uploadPlaylistSong:
   *   1. Validate required fields
   *   2. Duplicate check
   *   3. Upload audio + cover to Cloudinary
   *   4. Write song to Firestore via firebase.service.createSong
   *
   * Returns a status discriminated response so the controller can set the
   * correct HTTP status code (201 vs 200 for duplicate).
   *
   * @param {object} body
   * @param {object} files  — req.files (multer)
   * @param {string} uid
   * @returns {Promise<{ status: 'uploaded'|'duplicate', songId: string, song?: object, existing?: object }>}
   */
  async uploadPlaylistSong(body, files, uid) {
    const { title, artist, genre, duration } = body;

    if (!title || !artist || !genre) {
      throw new ValidationError('title, artist and genre are required', 'VALIDATION_ERROR');
    }

    // Duplicate check
    const existing = await checkDuplicateSong(title, artist);
    if (existing) {
      return {
        status:   'duplicate',
        songId:   existing.id,
        existing: { id: existing.id, title: existing.title, artist: existing.artist, createdAt: existing.createdAt },
      };
    }

    if (!files?.['song']?.[0])  throw new ValidationError('No song file received',  'MISSING_FILE');
    if (!files?.['cover']?.[0]) throw new ValidationError('No cover file received', 'MISSING_FILE');

    const songFile  = files['song'][0];
    const coverFile = files['cover'][0];

    let songResult, coverResult;
    try {
      [songResult, coverResult] = await Promise.all([
        uploadAudio(songFile.buffer,  { folder: 'melostream/songs',  public_id: `${Date.now()}-${title}` }),
        uploadCover(coverFile.buffer, { folder: 'melostream/covers', public_id: `${Date.now()}-${title}-cover` }),
      ]);
    } catch (err) {
      logger.error('PlaylistService.uploadPlaylistSong Cloudinary error:', { error: err.message });
      throw new InternalError('File upload failed. Please try again.', 'UPLOAD_ERROR', { originalError: err.message });
    }

    const now      = new Date();
    const songData = {
      title, artist, genre,
      titleLower:       title.toLowerCase(),
      artistLower:      artist.toLowerCase(),
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
    };

    try {
      const newSong = await createSong(songData);
      return {
        status:  'uploaded',
        songId:  newSong.id,
        song:    this._serializeDoc(newSong.id, songData),
      };
    } catch (err) {
      logger.error('PlaylistService.uploadPlaylistSong Firestore error:', { error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  /**
   * deleteAdminPlaylist(id) → { message }
   *
   * Validates the playlist is an admin playlist, deletes Cloudinary cover
   * if present, then deletes the Firestore document.
   *
   * @param {string} id
   * @returns {Promise<{ message: string }>}
   */
  async deleteAdminPlaylist(id) {
    let playlist;
    try {
      playlist = await this._playlistRepo.findById(id);
    } catch (err) {
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }

    if (!playlist) throw new NotFoundError('Playlist not found', 'NOT_FOUND');
    if (!playlist.isAdmin) throw new ForbiddenError('Not an admin playlist', 'FORBIDDEN');

    // Delete Cloudinary cover (best-effort)
    if (playlist.coverStoragePath) {
      try {
        await deleteAsset(playlist.coverStoragePath, { resource_type: 'image' });
      } catch (err) {
        logger.warn('PlaylistService.deleteAdminPlaylist: Cloudinary cover delete failed', {
          id, error: err.message,
        });
      }
    }

    try {
      await deletePlaylist(id);
      return { message: 'Playlist deleted successfully' };
    } catch (err) {
      logger.error('PlaylistService.deleteAdminPlaylist Firestore error:', { id, error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * _parseSongIds(songIds) → string[]
   * Parses and validates the songIds field (may arrive as JSON string or array).
   * @private
   */
  _parseSongIds(songIds) {
    let parsed = songIds;
    if (typeof songIds === 'string') {
      try { parsed = JSON.parse(songIds); } catch { parsed = []; }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new ValidationError('At least one song is required', 'VALIDATION_ERROR');
    }
    return parsed;
  }

  /**
   * _serializeDoc(id, data) → plain object with ISO timestamps
   * @private
   */
  _serializeDoc(id, data) {
    return {
      id,
      ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt.toISOString() : data.createdAt ?? null,
      updatedAt: data.updatedAt instanceof Date ? data.updatedAt.toISOString() : data.updatedAt ?? null,
    };
  }

  /**
   * _wrapError(err, message, code) → AppError
   * @private
   */
  _wrapError(err, message, code) {
    if (err.isOperational !== undefined) return err;
    return new InternalError(message, code, { originalError: err.message });
  }
}

module.exports = PlaylistService;