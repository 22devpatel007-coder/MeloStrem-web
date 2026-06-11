/**
 * server/src/middleware/errorHandler.js
 *
 * PHASE 1 — TASK 1.1: Unified error handler.
 * PHASE 4 — TASK 4.1: Enriched with correlationId tracing.
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
 * Phase 4 additions (correlationId tracing):
 *   - req.correlationId is included in EVERY log payload as a top-level field.
 *     Log aggregators (Datadog, CloudWatch) index this field so you can find
 *     the exact server log for any user-reported issue by copying the
 *     X-Correlation-ID header value from the browser network tab.
 *   - endpoint field: req.method + req.path (e.g. "PATCH /api/songs/abc123")
 *     added to every error log so you know which route threw without reading
 *     the message string.
 *   - userId field: req.user?.uid (set by verifyToken middleware upstream) so
 *     you can correlate errors to specific users in production.
 *   - errorType field: the constructor name of the error class (e.g.
 *     "ValidationError", "AuthError", "Error") — enables Datadog monitors like
 *     "alert if ValidationError rate exceeds 5% of requests".
 *
 * Previous behaviour fully preserved:
 *   - statusCode falls back to err.status then 500.
 *   - code falls back to 'INTERNAL_ERROR'.
 *   - isOperational check logic unchanged.
 *   - Client response shape unchanged.
 *   - stack only logged for non-operational errors.
 */

"use strict";

const logger = require("../utils/logger");
const AppError = require("../errors/AppError");

const GENERIC_MESSAGE = "Something went wrong. Please try again.";

/**
 * Global Express error handler.
 * Four-argument signature is required by Express to recognise this as an
 * error handler — do NOT remove the `next` parameter even if unused.
 *
 * @param {Error}                       err
 * @param {import('express').Request}   req
 * @param {import('express').Response}  res
 * @param {import('express').NextFunction} next
 */
const errorHandler = (err, req, res, next) => {
  // eslint-disable-line no-unused-vars
  // ── Classify error ─────────────────────────────────────────────────────────
  const isAppError = err instanceof AppError;
  const isOperational = isAppError ? err.isOperational : false;

  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || "INTERNAL_ERROR";

  // ── Build structured log payload ───────────────────────────────────────────
  //
  // Every field here becomes a top-level JSON key in production logs
  // (see logger.js productionFormat).  Log aggregators index all of them.
  //
  // Field inventory:
  //   correlationId — links this log entry to the exact browser request.
  //                   Frontend reads X-Correlation-ID response header and
  //                   includes it in error reports (Phase 4, Task 4.2).
  //   userId        — Firebase UID. Null for unauthenticated requests.
  //   endpoint      — "METHOD /path" — which route threw the error.
  //   errorType     — constructor name: "ValidationError", "NotFoundError", etc.
  //   code          — machine-readable error code from errorCodes.js.
  //   statusCode    — HTTP status integer (for metric dashboards).
  //   context       — arbitrary dev context attached to AppError subclasses.
  //   stack         — only for non-operational (programmer) errors.
  // ─────────────────────────────────────────────────────────────────────────
  const logPayload = {
    correlationId: req.correlationId ?? null, // set by correlationId middleware
    userId: req.user?.uid ?? null, // set by verifyToken middleware
    endpoint: `${req.method} ${req.path}`,
    errorType: err.constructor?.name ?? "Error",
    code,
    statusCode,
    ...(isAppError && err.context ? { context: err.context } : {}),
    // Stack trace only for programmer errors — never for expected operational
    // errors (404, 422, 401, etc.) to keep warn-level logs clean.
    ...(!isOperational ? { stack: err.stack } : {}),
  };

  // ── Log at the appropriate level ───────────────────────────────────────────
  if (isOperational) {
    // Expected errors (auth failure, validation, not found, rate limit, etc.)
    // → warn level. On-call does NOT need to wake up for these.
    logger.warn(`[${code}] ${err.message}`, logPayload);
  } else {
    // Programmer errors or unknown throws that escaped all try/catch blocks.
    // → error level with full stack. On-call SHOULD investigate these.
    logger.error(`[${code}] ${err.message}`, logPayload);
  }

  // ── Client response ────────────────────────────────────────────────────────
  // Never expose stack traces, internal error messages, or database details.
  // Operational errors send their own safe message; everything else gets the
  // generic fallback so internal implementation details never leak.
  const clientMessage = isOperational ? err.message : GENERIC_MESSAGE;
  res.locals.error = clientMessage;
  res.locals.stack = !isOperational ? err.stack : undefined;
  return res.status(statusCode).json({
    success: false,
    error: { code, message: clientMessage },
  });
};

module.exports = errorHandler;
