/**
 * server/src/services/UserService.js
 *
 * Phase 2 — Task 2.3: Service Layer OOP Refactor
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL business logic for the users domain.
 * Mirrors the exact behaviour of users.controller.js but as a testable class.
 *
 * Constructor dependencies (injected via container.js):
 *   userRepository  — UserRepository instance
 *   songRepository  — SongRepository instance (for liked-songs full fetch)
 *
 * Methods:
 *   getAllUsers()                        — admin: list all users (strips likedSongs)
 *   getLikedSongs(uid)                  — return full Song objects for liked IDs
 *   toggleLikedSong(uid, songId)        — add/remove from liked list, return new list
 *   logSessionPicks(uid, picks)         — validate + fire-and-forget write
 *
 * Error contract:
 *   All methods throw AppError subclasses.
 *   Controllers catch and pass to next(err).
 *
 * Session picks:
 *   logSessionPicks validates synchronously, then returns immediately.
 *   The actual Firestore write is fire-and-forget (not awaited after
 *   the controller has already responded). This preserves the existing
 *   non-blocking behaviour from users.controller.js exactly.
 */

'use strict';

const logger = require('../utils/logger');
const {
  ForbiddenError,
  ValidationError,
  InternalError,
} = require('../errors');

const VALID_CONTEXT_TYPES = new Set(['library', 'playlist', 'liked', 'dynamic']);
const MAX_PICKS_PER_BATCH = 50;

class UserService {
  /**
   * @param {import('../repositories/UserRepository')}  userRepository
   * @param {import('../repositories/SongRepository')}  songRepository
   */
  constructor(userRepository, songRepository) {
    if (!userRepository) throw new Error('UserService: userRepository is required');
    if (!songRepository) throw new Error('UserService: songRepository is required');

    this._userRepo = userRepository;
    this._songRepo = songRepository;
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * getAllUsers() → User[] (likedSongs stripped for safety)
   *
   * Admin-only. likedSongs field is stripped before returning —
   * it is only accessible through getLikedSongs() with ownership check.
   *
   * @returns {Promise<object[]>}
   */
  async getAllUsers() {
    try {
      const users = await this._userRepo.findAll();
      // Strip likedSongs — same as original controller behaviour
      return users.map((u) => ({ ...u, likedSongs: undefined }));
    } catch (err) {
      logger.error('UserService.getAllUsers error:', { error: err.message });
      throw this._wrapError(err, 'Failed to fetch users. Please try again.', 'INTERNAL_ERROR');
    }
  }

  /**
   * getLikedSongs(requestingUid, targetUid) → Song[]
   *
   * Enforces ownership: requestingUid must equal targetUid.
   * Returns full Song objects (not just IDs) via batch fetch.
   * Returns empty array if user has no liked songs.
   *
   * @param {string} requestingUid — from req.user.uid
   * @param {string} targetUid     — from req.params.uid
   * @returns {Promise<object[]>}
   */
  async getLikedSongs(requestingUid, targetUid) {
    this._enforceOwnership(requestingUid, targetUid);

    try {
      const likedIds = await this._userRepo.getLikedSongs(targetUid);
      if (!likedIds || likedIds.length === 0) return [];

      // Batch fetch full Song objects in one Firestore roundtrip
      const songs = await this._songRepo.findByIds(likedIds);
      return songs;
    } catch (err) {
      logger.error('UserService.getLikedSongs error:', { uid: targetUid, error: err.message });
      throw this._wrapError(err, 'Failed to fetch liked songs. Please try again.', 'INTERNAL_ERROR');
    }
  }

  /**
   * toggleLikedSong(requestingUid, targetUid, songId) → string[]
   *
   * Enforces ownership, then atomically toggles the song in the liked list.
   * Returns the updated full liked song ID array.
   *
   * @param {string} requestingUid
   * @param {string} targetUid
   * @param {string} songId
   * @returns {Promise<string[]>}
   */
  async toggleLikedSong(requestingUid, targetUid, songId) {
    this._enforceOwnership(requestingUid, targetUid);

    if (!songId || typeof songId !== 'string' || !songId.trim()) {
      throw new ValidationError('songId is required', 'VALIDATION_ERROR');
    }

    try {
      const { likedSongs } = await this._userRepo.toggleLikedSong(targetUid, songId.trim());
      return likedSongs;
    } catch (err) {
      logger.error('UserService.toggleLikedSong error:', { uid: targetUid, songId, error: err.message });
      throw this._wrapError(err, 'Failed to update liked songs. Please try again.', 'INTERNAL_ERROR');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // SESSION PICKS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * validateAndSanitizePicks(picks) → sanitized picks array
   *
   * Validates and sanitizes the raw picks payload.
   * Throws synchronously if the payload is structurally invalid.
   * Called before the HTTP response is sent so validation errors
   * still reach the client.
   *
   * @param {any} picks
   * @returns {object[]}
   */
  validateAndSanitizePicks(picks) {
    if (!Array.isArray(picks) || picks.length === 0) {
      throw new ValidationError('picks must be a non-empty array', 'VALIDATION_ERROR');
    }
    if (picks.length > MAX_PICKS_PER_BATCH) {
      throw new ValidationError(
        `picks batch too large — max ${MAX_PICKS_PER_BATCH} per request`,
        'VALIDATION_ERROR',
      );
    }

    return picks
      .filter((p) => p && typeof p.songId === 'string' && p.songId.trim())
      .map((p) => ({
        songId:         p.songId.trim(),
        previousSongId: typeof p.previousSongId === 'string' ? p.previousSongId.trim() : null,
        contextType:    VALID_CONTEXT_TYPES.has(p.contextType) ? p.contextType : 'library',
        contextId:      typeof p.contextId === 'string' ? p.contextId.trim() : null,
        clientTs:       typeof p.ts === 'number' ? p.ts : Date.now(),
      }));
  }

  /**
   * writeSessionPicks(uid, sanitizedPicks) → void (fire-and-forget)
   *
   * Writes session picks to Firestore as a sub-collection document.
   * Mirrors the exact write shape from users.controller.js.
   * This method is intentionally NOT awaited by the controller —
   * the HTTP response is sent before this resolves.
   *
   * Errors are caught and logged; they never propagate to the client
   * because the client already received { success: true }.
   *
   * @param {string}   uid
   * @param {object[]} sanitizedPicks
   * @returns {Promise<void>}
   */
  async writeSessionPicks(uid, sanitizedPicks) {
    if (!sanitizedPicks || sanitizedPicks.length === 0) return;

    const today     = new Date().toISOString().slice(0, 10);
    const sessionId = `${uid}_${today}`;

    try {
      // Write to sessionPicks sub-collection — same pattern as original controller.
      // This mirrors: db.collection('users').doc(uid).collection('sessionPicks').add(...)
      // We go through userRepository.executeWithRetry to keep circuit breaker coverage.
      await this._userRepo.writeSessionPicks(uid, sessionId, sanitizedPicks);
    } catch (err) {
      // Non-blocking — client already got success. Log and move on.
      logger.error('UserService.writeSessionPicks error:', { uid, error: err.message });
    }
  }

  /**
   * logSessionPicks(requestingUid, targetUid, picks) → { sanitized }
   *
   * Validates ownership and picks synchronously.
   * Returns the sanitized picks so the controller can fire-and-forget
   * the actual write after sending { success: true }.
   *
   * @param {string}   requestingUid
   * @param {string}   targetUid
   * @param {any}      picks
   * @returns {{ sanitized: object[] }}
   */
  logSessionPicks(requestingUid, targetUid, picks) {
    this._enforceOwnership(requestingUid, targetUid);
    const sanitized = this.validateAndSanitizePicks(picks);
    return { sanitized };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * _enforceOwnership(requestingUid, targetUid)
   * Throws ForbiddenError if the requesting user is not the owner.
   * @private
   */
  _enforceOwnership(requestingUid, targetUid) {
    if (requestingUid !== targetUid) {
      throw new ForbiddenError('Forbidden', 'FORBIDDEN');
    }
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

module.exports = UserService;