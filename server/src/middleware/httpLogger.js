'use strict';

/**
 * server/src/middleware/httpLogger.js
 *
 * HTTP request/response logger middleware.
 *
 * Behaviour:
 *   INFO  — every request, single clean line only
 *   WARN  — requests > 2000ms, line + JSON context
 *   ERROR — requests > 5000ms OR 4xx/5xx, line + JSON context
 *
 * Excluded routes (no log at all unless they fail):
 *   /health, /ready, /metrics, /favicon.ico
 *
 * Feature fields via res.locals (set by controllers):
 *   songId, playlistId, query, resultCount, artistId
 */

const logger = require('../utils/logger');

const SLOW_THRESHOLD      = 2000; // ms → WARN
const VERY_SLOW_THRESHOLD = 5000; // ms → ERROR

const EXCLUDED_ROUTES = new Set(['/health', '/ready', '/metrics', '/favicon.ico']);

// Detect device type from user-agent
function getDevice(ua) {
  if (!ua) return 'unknown';
  if (/mobile/i.test(ua))  return 'mobile';
  if (/tablet/i.test(ua))  return 'tablet';
  return 'desktop';
}

module.exports = function httpLogger(req, res, next) {
  // Skip excluded routes entirely unless they fail
  const isExcluded = EXCLUDED_ROUTES.has(req.path);

  const startedAt = Date.now();

  // Fire after response is sent
  res.on('finish', () => {
    const durationMs    = Date.now() - startedAt;
    const { statusCode } = res;
    const method         = req.method;
    const route          = req.path;
    const uid            = req.user?.uid ?? null;
    const correlationId  = req.correlationId ?? null;
    const ip             = req.ip ?? null;
    const device         = getDevice(req.headers?.['user-agent']);
    const responseSize   = parseInt(res.getHeader('content-length') || '0', 10) || null;

    // Feature-specific fields set by controllers via res.locals
    const {
      songId      = undefined,
      playlistId  = undefined,
      query       = undefined,
      resultCount = undefined,
      artistId    = undefined,
    } = res.locals ?? {};

    const isError    = statusCode >= 400;
    const isVerySlow = durationMs > VERY_SLOW_THRESHOLD;
    const isSlow     = durationMs > SLOW_THRESHOLD;

    // ── Excluded routes ───────────────────────────────────────────────────────
    // Silent on success. Log only on failure so probe errors are never missed.
    if (isExcluded) {
      if (isError) {
        logger.error(`${method} ${route} ${statusCode} ${durationMs}ms`, {
          correlationId,
          statusCode,
          durationMs,
          error: `probe returned ${statusCode}`,
        });
      }
      return;
    }

    // ── INFO: clean single line ───────────────────────────────────────────────
    // Always log — provides the audit trail in terminal.
    // uid=null is printed as-is so you can see unauthenticated requests.
    logger.info(`${method} ${route} ${statusCode} ${durationMs}ms uid=${uid}`);

    // ── WARN: slow request ────────────────────────────────────────────────────
    if (isSlow && !isVerySlow) {
      const context = {
        uid,
        correlationId,
        durationMs,
        route,
        method,
        // Feature fields — only included when set by controller
        ...(query       !== undefined && { query }),
        ...(resultCount !== undefined && { resultCount }),
        ...(songId      !== undefined && { songId }),
        ...(playlistId  !== undefined && { playlistId }),
        ...(artistId    !== undefined && { artistId }),
      };
      logger.warn(`${method} ${route} ${statusCode} ${durationMs}ms [SLOW]`, context);
      return;
    }

    // ── ERROR: very slow request ──────────────────────────────────────────────
    if (isVerySlow) {
      const context = {
        uid,
        correlationId,
        durationMs,
        route,
        method,
        responseSize,
        ...(songId     !== undefined && { songId }),
        ...(playlistId !== undefined && { playlistId }),
        ...(artistId   !== undefined && { artistId }),
      };
      logger.error(`${method} ${route} ${statusCode} ${durationMs}ms [VERY SLOW]`, context);
      return;
    }

    // ── ERROR: 4xx / 5xx ─────────────────────────────────────────────────────
    if (isError) {
      const context = {
        uid,
        correlationId,
        route,
        method,
        statusCode,
        durationMs,
        ip,
        device,
        // Feature fields
        ...(songId      !== undefined && { songId }),
        ...(playlistId  !== undefined && { playlistId }),
        ...(query       !== undefined && { query }),
        ...(resultCount !== undefined && { resultCount }),
        ...(artistId    !== undefined && { artistId }),
        // Error detail from res.locals (set by errorHandler or controllers)
        ...(res.locals.error ? {
          error: res.locals.error,
          stack: res.locals.stack ?? undefined,
        } : {}),
      };
      logger.error(`${method} ${route} ${statusCode} ${durationMs}ms`, context);
    }
  });

  next();
};