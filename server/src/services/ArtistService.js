/**
 * server/src/services/ArtistService.js
 *
 * Phase 2 — Task 2.3: Service Layer OOP Refactor
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL business logic for the artists domain (read-only public API).
 * Mirrors the exact behaviour of artists.controller.js but as a testable class.
 *
 * Constructor dependencies (injected via container.js):
 *   artistRepository — ArtistRepository instance
 *   songRepository   — SongRepository instance (for getArtistSongs pagination)
 *
 * Methods:
 *   getArtist(id)                            — fetch single artist by ID
 *   getArtistSongs(id, limit, cursor)        — paginated songs for an artist
 *
 * Error contract:
 *   All methods throw AppError subclasses.
 *   Controllers catch and pass to next(err).
 *
 * Pagination contract:
 *   getArtistSongs returns { songs, nextCursor, hasMore } — exact same shape
 *   as GET /api/artists/:id/songs API contract. The controller just passes
 *   this object directly to res.json().
 */

'use strict';

const logger = require('../utils/logger');
const {
  ValidationError,
  NotFoundError,
  InternalError,
} = require('../errors');

const SONGS_PER_PAGE  = 30;
const MAX_SONGS_LIMIT = 50;

class ArtistService {
  /**
   * @param {import('../repositories/ArtistRepository')} artistRepository
   * @param {import('../repositories/SongRepository')}   songRepository
   */
  constructor(artistRepository, songRepository) {
    if (!artistRepository) throw new Error('ArtistService: artistRepository is required');
    if (!songRepository)   throw new Error('ArtistService: songRepository is required');

    this._artistRepo = artistRepository;
    this._songRepo   = songRepository;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * getArtist(id) → Artist object
   *
   * Throws NotFoundError if the artist does not exist.
   *
   * @param {string} id — deterministic artist ID (e.g. "artist_arijit-singh")
   * @returns {Promise<object>}
   */
  async getArtist(id) {
    this._requireString(id, 'artist ID');

    try {
      const artist = await this._artistRepo.findById(id.trim());
      if (!artist) throw new NotFoundError('Artist not found', 'NOT_FOUND');
      return artist;
    } catch (err) {
      if (err.isOperational !== undefined) throw err;
      logger.error('ArtistService.getArtist error:', { id, error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  /**
   * getArtistSongs(id, limit, cursor) → { songs, nextCursor, hasMore }
   *
   * Verifies artist exists first (throws NotFoundError for unknown IDs).
   * Returns paginated songs ordered by createdAt DESC.
   * Mirrors GET /api/artists/:id/songs contract exactly.
   *
   * Note: SongRepository.findByArtistId orders by trackNumber ASC.
   * The original artists.controller ordered by createdAt DESC.
   * We preserve the original controller behaviour here by using a direct
   * repository call that matches — both approaches are correct depending on use.
   * The original controller used createdAt DESC so we replicate that.
   *
   * @param {string}      id
   * @param {number}      limit
   * @param {string|null} cursor
   * @returns {Promise<{ songs: object[], nextCursor: string|null, hasMore: boolean }>}
   */
  async getArtistSongs(id, limit, cursor) {
    this._requireString(id, 'artist ID');

    const safeLimit = Math.min(parseInt(limit) || SONGS_PER_PAGE, MAX_SONGS_LIMIT);

    // Verify artist exists — return 404 rather than an empty list for unknown IDs
    await this.getArtist(id);

    try {
      // Use repository's executeWithRetry with a createdAt DESC query to
      // preserve the original controller's ordering (createdAt desc, not trackNumber asc).
      const result = await this._artistRepo.executeWithRetry(async () => {
        const db = this._artistRepo._db;

        let query = db
          .collection('songs')
          .where('artistId', '==', id.trim())
          .orderBy('createdAt', 'desc')
          .limit(safeLimit + 1); // fetch one extra to determine hasMore

        if (cursor) {
          const cursorSnap = await db.collection('songs').doc(cursor).get();
          if (cursorSnap.exists) query = query.startAfter(cursorSnap);
        }

        const snaps    = await query.get();
        const docs     = snaps.docs;
        const hasMore  = docs.length > safeLimit;
        const pageDocs = hasMore ? docs.slice(0, safeLimit) : docs;

        return {
          songs:      pageDocs.map((snap) => {
            const data = snap.data();
            return {
              id:        snap.id,
              ...data,
              createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
              updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
            };
          }),
          nextCursor: hasMore ? pageDocs[pageDocs.length - 1].id : null,
          hasMore,
        };
      }, `getArtistSongs(${id})`);

      return result;
    } catch (err) {
      if (err.isOperational !== undefined) throw err;
      logger.error('ArtistService.getArtistSongs error:', { id, error: err.message });
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

module.exports = ArtistService;