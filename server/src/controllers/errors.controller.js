/**
 * server/src/controllers/errors.controller.js
 *
 * PHASE 4 — TASK 4.2: Frontend Error Collection — Backend Receiver
 *
 * WHAT THIS DOES:
 *   Receives batched frontend error reports from POST /api/errors/report,
 *   validates the payload shape, attaches server-side context (timestamp,
 *   IP address, server version), and writes every individual report to
 *   Winston as a structured log entry.
 *
 * WHY A DEDICATED CONTROLLER (not inlined in the route):
 *   - Keeps the route file thin (matches the convention in CLAUDE.md §6).
 *   - Makes the validation and logging logic independently testable.
 *   - The controller can be swapped to forward to Sentry/Datadog without
 *     touching the route or rate-limiter configuration.
 *
 * REQUEST CONTRACT:
 *   POST /api/errors/report
 *   Content-Type: application/json
 *   Body: {
 *     reports: Array<{
 *       message:        string          — error message
 *       stack:          string | null   — stack trace (trimmed to 2000 chars client-side)
 *       errorCode:      string | null   — AppError / ServiceError code
 *       page:           string          — URL path where the error occurred
 *       action:         string | null   — what the user was doing
 *       componentStack: string | null   — React component stack (boundary catches only)
 *       boundary:       string | null   — which ErrorBoundary fired
 *       userId:         string | null   — Firebase uid (null if unauthenticated)
 *       correlationId:  string | null   — X-Correlation-ID from last API response
 *       userAgent:      string          — navigator.userAgent
 *       timestamp:      string          — ISO 8601 client-side timestamp
 *       occurrences:    number          — dedup count (≥ 1)
 *       sessionReportSeq: number        — report sequence number this session
 *     }>
 *   }
 *
 * RESPONSE:
 *   200 { success: true, received: number }
 *   400 { success: false, error: { code, message } }    — bad payload shape
 *   429                                                  — rate limiter (handled in route)
 *
 * SECURITY:
 *   - The endpoint is public (no Firebase auth) so it can receive reports
 *     from unauthenticated states (login page crash, token refresh failure).
 *   - Rate limiting (10/min per IP) is applied at the route level via
 *     errorReportLimiter from rateLimiter.js — not here.
 *   - All string fields are truncated before logging to prevent log injection
 *     and unbounded storage growth.
 *   - The IP address is read from req.ip, which respects the trust-proxy
 *     setting in server/src/index.js (important on Render/Vercel deployments).
 *   - We intentionally do NOT write error reports to Firestore. They are
 *     append-only log events, not queryable application data. Winston handles
 *     persistence (stdout on Render → log aggregator).
 *
 * FIELD LIMITS (truncation applied before logging):
 *   message        → 500 chars
 *   stack          → 3 000 chars
 *   componentStack → 3 000 chars
 *   page           → 300 chars
 *   action         → 200 chars
 *   userAgent      → 300 chars
 *   errorCode      → 100 chars
 *   boundary       → 100 chars
 *   correlationId  → 64 chars (UUID + potential prefix)
 *   userId         → 128 chars (Firebase uid max is 128)
 */

const logger = require('../utils/logger');

// ── Constants ─────────────────────────────────────────────────────────────────

/** Maximum number of reports accepted in a single batch request. */
const MAX_BATCH_SIZE = 20;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Truncate a string value to `maxLen` characters.
 * Returns null for non-string / falsy input.
 *
 * @param {unknown} value
 * @param {number}  maxLen
 * @returns {string|null}
 */
function truncate(value, maxLen) {
  if (typeof value !== 'string' || value.length === 0) return null;
  return value.length <= maxLen ? value : value.slice(0, maxLen) + '…';
}

/**
 * Validate and sanitize a single report object from the batch.
 * Returns a cleaned object on success, or null if the report is too malformed
 * to be useful (missing both message and errorCode).
 *
 * We apply generous validation here — the goal is to capture as many
 * legitimate reports as possible. We only reject reports that carry zero
 * diagnostic value.
 *
 * @param {unknown} raw
 * @returns {object|null}
 */
function sanitizeReport(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const message   = truncate(raw.message,        500);
  const errorCode = truncate(raw.errorCode,       100);

  // A report with neither a message nor a code is meaningless — discard.
  if (!message && !errorCode) return null;

  return {
    message,
    stack:          truncate(raw.stack,           3_000),
    errorCode,
    page:           truncate(raw.page,            300),
    action:         truncate(raw.action,          200),
    componentStack: truncate(raw.componentStack,  3_000),
    boundary:       truncate(raw.boundary,        100),
    userId:         truncate(raw.userId,          128),
    correlationId:        truncate(raw.relatedCorrelationId, 64),
reportId:             truncate(raw.reportId,             64),
    userAgent:      truncate(raw.userAgent,       300),
    // Preserve client timestamp as a string — we add server timestamp separately.
    clientTimestamp: typeof raw.timestamp === 'string'
      ? truncate(raw.timestamp, 30)
      : null,
    // Numeric fields — default to 1 if absent or invalid.
    occurrences:     Number.isFinite(raw.occurrences)    && raw.occurrences    >= 1 ? raw.occurrences    : 1,
    sessionReportSeq: Number.isFinite(raw.sessionReportSeq) && raw.sessionReportSeq >= 1 ? raw.sessionReportSeq : 1,
  };
}

// ── Controller ────────────────────────────────────────────────────────────────

/**
 * POST /api/errors/report
 *
 * Accepts a batch of frontend error reports, sanitizes each one, and writes
 * them to the Winston logger as individual structured entries.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
const receiveErrorReports = (req, res, next) => {
  try {
    const { reports } = req.body;

    // ── Payload validation ──────────────────────────────────────────────────
    if (!Array.isArray(reports)) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'VALIDATION_ERROR',
          message: 'reports must be an array',
        },
      });
    }

    if (reports.length === 0) {
      // Empty batch — valid but nothing to do.
      return res.status(200).json({ success: true, received: 0 });
    }

    if (reports.length > MAX_BATCH_SIZE) {
      return res.status(400).json({
        success: false,
        error: {
          code:    'VALIDATION_ERROR',
          message: `Batch exceeds maximum size of ${MAX_BATCH_SIZE}`,
        },
      });
    }

    // ── Server-side context (same for every report in this batch) ──────────
    const serverTimestamp = new Date().toISOString();
    // req.ip respects trust proxy setting in server/src/index.js.
    // On Render, this will be the real client IP from the X-Forwarded-For header.
    const clientIp        = req.ip || 'unknown';

    // ── Process each report ─────────────────────────────────────────────────
    let accepted = 0;

    for (const raw of reports) {
      const report = sanitizeReport(raw);

      // Skip reports that carry zero diagnostic value.
      if (!report) continue;

      // Build the final structured log entry.
      const logEntry = {
        // Routing / filtering fields — appear at the top level for easy
        // log aggregator filtering (e.g. filter by type='frontend_error').
        type:             'frontend_error',
        boundary:         report.boundary,
        errorCode:        report.errorCode,

        // Error detail
        message:          report.message,
        stack:            report.stack,
        componentStack:   report.componentStack,

        // Context
        page:             report.page,
        action:           report.action,
        userId:           report.userId,
        correlationId:    report.correlationId, 
        reportId:         report.reportId,

        // Dedup / session metadata
        occurrences:      report.occurrences,
        sessionReportSeq: report.sessionReportSeq,

        // Timestamps
        clientTimestamp:  report.clientTimestamp,
        serverTimestamp,

        // Request metadata
        clientIp,
        userAgent:        report.userAgent,
      };

      // Log at 'warn' level — these are client errors, not server errors.
      // Use 'error' level only if the boundary field indicates AppErrorBoundary
      // (outermost boundary) — those represent total app crashes.
      const level = report.boundary === 'AppErrorBoundary' ? 'error' : 'warn';

      logger[level]('[frontend_error]', logEntry);

      accepted += 1;
    }

    // ── Respond ─────────────────────────────────────────────────────────────
    // Always 200 — from the client's perspective, delivery succeeded.
    // We accepted and logged whatever was valid.
    return res.status(200).json({ success: true, received: accepted });

  } catch (err) {
    // Unexpected controller error — pass to global error handler.
    // This path should never be reached under normal operation.
    next(err);
  }
};

module.exports = { receiveErrorReports };