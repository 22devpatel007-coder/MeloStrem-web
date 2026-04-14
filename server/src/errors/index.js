/**
 * server/src/errors/index.js
 *
 * All AppError subclasses for MeloStream.
 *
 * Import pattern in controllers:
 *   const { ValidationError, NotFoundError } = require('../errors');
 *
 * Every subclass has sensible defaults so callers only pass what varies.
 * The `code` param always maps to a value from shared/constants/errorCodes.js.
 */

'use strict';

const AppError = require('./AppError');

// ── 400 Bad Request ──────────────────────────────────────────────────────────
class ValidationError extends AppError {
  constructor(message = 'Invalid request data', code = 'VALIDATION_ERROR', context = {}) {
    super(message, code, 400, true, context);
  }
}

// ── 401 Unauthorized ─────────────────────────────────────────────────────────
class AuthError extends AppError {
  constructor(message = 'Authentication required', code = 'AUTH_ERROR', context = {}) {
    super(message, code, 401, true, context);
  }
}

// ── 403 Forbidden ────────────────────────────────────────────────────────────
class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action', code = 'FORBIDDEN', context = {}) {
    super(message, code, 403, true, context);
  }
}

// ── 404 Not Found ────────────────────────────────────────────────────────────
class NotFoundError extends AppError {
  constructor(message = 'Resource not found', code = 'NOT_FOUND', context = {}) {
    super(message, code, 404, true, context);
  }
}

// ── 409 Conflict ─────────────────────────────────────────────────────────────
class ConflictError extends AppError {
  constructor(message = 'Resource already exists', code = 'CONFLICT', context = {}) {
    super(message, code, 409, true, context);
  }
}

// ── 429 Rate Limit ───────────────────────────────────────────────────────────
class RateLimitError extends AppError {
  constructor(message = 'Too many requests. Please try again later.', code = 'RATE_LIMIT_EXCEEDED', context = {}) {
    super(message, code, 429, true, context);
  }
}

// ── 502 Bad Gateway (external service failure) ───────────────────────────────
class ServiceError extends AppError {
  constructor(message = 'An upstream service is unavailable. Please try again.', code = 'SERVICE_ERROR', context = {}) {
    super(message, code, 502, true, context);
  }
}

// ── 500 Internal (programmer errors / truly unexpected) ──────────────────────
// isOperational=false → errorHandler sends a generic message, logs full stack.
class InternalError extends AppError {
  constructor(message = 'An unexpected error occurred', code = 'INTERNAL_ERROR', context = {}) {
    super(message, code, 500, false, context);
  }
}

module.exports = {
  AppError,
  ValidationError,
  AuthError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  ServiceError,
  InternalError,
};