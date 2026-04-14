/**
 * server/src/middleware/errorHandler.js
 *
 * PHASE 1 — TASK 1.1: Unified error handler.
 *
 * This is the ONLY place in the entire server that calls res.json() with an
 * error payload. Controllers throw AppError subclasses (or call next(err));
 * this middleware catches them all.
 *
 * Response shape is always:
 *   { success: false, error: { code: string, message: string } }
 *
 * Operational errors (isOperational=true):
 *   → Real message and code sent to the client.
 *   → Logged at warn level (expected, not actionable by on-call).
 *
 * Non-operational errors (isOperational=false, or unknown Error class):
 *   → Generic "Something went wrong" sent to the client — never leaks stack.
 *   → Logged at error level with full stack (actionable, needs investigation).
 *
 * Previous behaviour preserved:
 *   - statusCode falls back to err.status then 500 (same as before).
 *   - code falls back to 'INTERNAL_ERROR' (same as before).
 *   - logger.error call preserved and enriched with path and userId.
 */

'use strict';

const logger   = require('../utils/logger');
const AppError = require('../errors/AppError');

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const errorHandler = (err, req, res, next) => { // eslint-disable-line no-unused-vars
  // ── Determine if this is a known, operational AppError ─────────────────────
  const isAppError    = err instanceof AppError;
  const isOperational = isAppError ? err.isOperational : false;

  const statusCode = err.statusCode || err.status || 500;
  const code       = err.code       || 'INTERNAL_ERROR';

  // ── Logging ────────────────────────────────────────────────────────────────
  const logPayload = {
    path:    req.path,
    method:  req.method,
    code,
    statusCode,
    userId:  req.user?.uid ?? null,
    ...(isAppError && err.context ? { context: err.context } : {}),
    // Only include stack for non-operational (programmer) errors.
    ...(!isOperational ? { stack: err.stack } : {}),
  };

  if (isOperational) {
    // Expected errors: warn level — no stack trace needed.
    logger.warn(`[${code}] ${err.message}`, logPayload);
  } else {
    // Programmer errors or unknown throws: error level with full stack.
    logger.error(`[${code}] ${err.message}`, logPayload);
  }

  // ── Response ───────────────────────────────────────────────────────────────
  // Never send stack traces or internal details to the client.
  const clientMessage = isOperational ? err.message : GENERIC_MESSAGE;

  return res.status(statusCode).json({
    success: false,
    error:   { code, message: clientMessage },
  });
};

module.exports = errorHandler;