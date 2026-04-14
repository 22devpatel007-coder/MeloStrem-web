/**
 * server/src/services/AlbumService.js
 *
 * Phase 2 — Task 2.3: Service Layer OOP Refactor
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL business logic for the albums domain (read-only public API).
 * Mirrors the exact behaviour of albums.controller.js but as a testable class.
 *
 * Constructor dependencies (injected via container.js):
 *   albumRepository — AlbumRepository instance
 *   songRepository  — SongRepository instance (for getAlbumSongs)
 *
 * Methods:
 *   getAlbum(id)      — fetch single album by ID
 *   getAlbumSongs(id) — all songs for an album ordered by trackNumber ASC
 *
 * Error contract:
 *   All methods throw AppError subclasses.
 *   Controllers catch and pass to next(err).
 *
 * getAlbumSongs design notes:
 *   - Non-paginated: albums are bounded in size (albums.controller comment says
 *     "typically < 30 songs"). BaseRepository caps album queries at 200.
 *   - Songs with null trackNumber are sorted to the END in application code
 *     after fetch — same as the original controller sort logic. Firestore
 *     orders nulls FIRST in ascending queries, so we push them last here.
 *
 * IMPORTANT — findOrCreateAlbum (album.service.js):
 *   The existing album.service.js exports findOrCreateAlbum() which is called
 *   by songs.controller (upload flow). That file is NOT replaced by this class.
 *   This AlbumService class is ONLY for the read API (getAlbum, getAlbumSongs).
 *   Both files coexist. container.js exports albumService (this class) AND
 *   the legacy album.service.js functions remain importable directly.
 */

'use strict';

const logger = require('../utils/logger');
const {
  ValidationError,
  NotFoundError,
  InternalError,
} = require('../errors');

class AlbumService {
  /**
   * @param {import('../repositories/AlbumRepository')} albumRepository
   * @param {import('../repositories/SongRepository')}  songRepository
   */
  constructor(albumRepository, songRepository) {
    if (!albumRepository) throw new Error('AlbumService: albumRepository is required');
    if (!songRepository)  throw new Error('AlbumService: songRepository is required');

    this._albumRepo = albumRepository;
    this._songRepo  = songRepository;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * getAlbum(id) → Album object
   *
   * Throws NotFoundError if the album does not exist.
   *
   * @param {string} id — deterministic album ID
   * @returns {Promise<object>}
   */
  async getAlbum(id) {
    this._requireString(id, 'album ID');

    try {
      const album = await this._albumRepo.findById(id.trim());
      if (!album) throw new NotFoundError('Album not found', 'NOT_FOUND');
      return album;
    } catch (err) {
      if (err.isOperational !== undefined) throw err;
      logger.error('AlbumService.getAlbum error:', { id, error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  /**
   * getAlbumSongs(id) → { songs, albumId }
   *
   * Verifies album exists first (throws NotFoundError for unknown IDs).
   * Returns all songs for the album ordered by trackNumber ASC,
   * with null-trackNumber songs pushed to the end (application-level sort).
   *
   * Mirrors GET /api/albums/:id/songs contract: { songs: Song[], albumId: string }
   *
   * @param {string} id
   * @returns {Promise<{ songs: object[], albumId: string }>}
   */
  async getAlbumSongs(id) {
    this._requireString(id, 'album ID');
    const albumId = id.trim();

    // Verify album exists — 404 for unknown ID (same as original controller)
    await this.getAlbum(albumId);

    try {
      const songs = await this._songRepo.findByAlbumId(albumId);

      // Push songs with null/undefined trackNumber to end of list.
      // Firestore orders nulls first in ASC queries — so we sort in app code.
      // This is the SAME sort logic as the original albums.controller.js.
      songs.sort((a, b) => {
        if (a.trackNumber == null && b.trackNumber == null) return 0;
        if (a.trackNumber == null) return 1;
        if (b.trackNumber == null) return -1;
        return a.trackNumber - b.trackNumber;
      });

      return { songs, albumId };
    } catch (err) {
      if (err.isOperational !== undefined) throw err;
      logger.error('AlbumService.getAlbumSongs error:', { albumId, error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════════

  _requireString(value, name) {
    if (!value || typeof value !== 'string' || !value.trim()) {
      throw new ValidationError(`Invalid ${name}`, 'VALIDATION_ERROR');
    }
  }

  _wrapError(err, message, code) {
    if (err.isOperational !== undefined) return err;
    return new InternalError(message, code, { originalError: err.message });
  }
}

module.exports = AlbumService;