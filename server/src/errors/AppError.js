/**
 * server/src/errors/AppError.js
 *
 * Base class for all operational errors in MeloStream.
 *
 * isOperational = true  → expected error (bad input, not found, auth fail).
 *                         errorHandler sends the real message to the client.
 * isOperational = false → programmer error (bug, unexpected throw).
 *                         errorHandler sends a generic 500 and logs the full stack.
 *
 * Usage in controllers:
 *   throw new ValidationError('title is required', 'VALIDATION_ERROR');
 *   throw new NotFoundError('Song not found', 'SONG_NOT_FOUND');
 *   next(new AuthError('Forbidden', 'FORBIDDEN'));   // inside async try/catch
 */

'use strict';

class AppError extends Error {
  /**
   * @param {string} message      - User-safe description of the error.
   * @param {string} code         - Machine-readable code from errorCodes.js.
   * @param {number} statusCode   - HTTP status code.
   * @param {boolean} isOperational - true = expected; false = programmer error.
   * @param {object} [context]    - Extra data logged for developers (never sent to client).
   */
  constructor(message, code, statusCode, isOperational = true, context = {}) {
    super(message);
    this.name         = this.constructor.name;
    this.code         = code;
    this.statusCode   = statusCode;
    this.isOperational = isOperational;
    this.context      = context;
    // Preserves the correct stack trace in V8 (Node.js).
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

module.exports = AppError;