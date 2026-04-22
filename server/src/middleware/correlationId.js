/**
 * server/src/middleware/correlationId.js
 *
 * PHASE 4 — TASK 4.1: Request Tracing with Correlation IDs
 *
 * What this does:
 *   For EVERY incoming HTTP request:
 *     1. Reads X-Correlation-ID from the request header (if a caller supplied one).
 *        If missing, generates a fresh UUID via crypto.randomUUID() — zero dependency,
 *        built into Node 14.17+.
 *     2. Attaches the ID to req.correlationId so every downstream middleware,
 *        controller, and service can include it in log calls without re-reading headers.
 *     3. Sets X-Correlation-ID on the response so the frontend can include it in
 *        error reports, enabling exact log lookup for any user-reported issue.
 *
 * Why we accept a caller-supplied ID:
 *   Some deployment topologies (API gateways, upstream services, end-to-end test
 *   harnesses) already stamp a correlation ID on outbound requests. Honouring that
 *   value stitches distributed traces together without any additional tooling.
 *   We sanitise the supplied value to prevent header injection.
 *
 * Security note:
 *   The incoming header is stripped to printable ASCII (32–126), max 128 chars,
 *   to prevent log injection and oversized header abuse. Any non-conforming header
 *   value is silently replaced with a fresh UUID — the request is never rejected.
 *
 * Usage in controllers / services:
 *   Every logger call MUST include req.correlationId in its metadata object:
 *
 *     logger.info('getSongs called', {
 *       correlationId: req.correlationId,
 *       userId:        req.user?.uid ?? null,
 *       ...otherContext,
 *     });
 *
 *   Do NOT pass correlationId as part of the message string — put it in the
 *   metadata object so log aggregators (Datadog, CloudWatch, etc.) can index it
 *   as a structured field and correlate logs across services.
 */

'use strict';

const { randomUUID } = require('crypto');

// Regex: printable ASCII only (space excluded), max 128 chars.
// Covers UUID v4 format, ULIDs, and common APM trace ID formats.
const SAFE_CORRELATION_ID = /^[\x21-\x7E]{1,128}$/;

/**
 * sanitiseCorrelationId
 *
 * Returns the caller-supplied value if it is safe, otherwise returns null
 * so the middleware falls through to UUID generation.
 *
 * @param {string|undefined} value
 * @returns {string|null}
 */
function sanitiseCorrelationId(value) {
  if (typeof value !== 'string') return null;
  return SAFE_CORRELATION_ID.test(value) ? value : null;
}

/**
 * correlationId middleware
 *
 * Must be registered AFTER body parsers and CORS (so response headers can be
 * set) but BEFORE all route handlers and the error handler.
 *
 * Exact position in index.js:
 *   app.use(cors(corsOptions));          ← CORS must come first
 *   app.use(express.json(...));          ← body parsers
 *   app.use(generalLimiter);            ← rate limiter
 *   app.use(correlationId);             ← ← this middleware goes here
 *   app.use('/api', routes);
 *   app.use(errorHandler);
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function correlationId(req, res, next) {
  const incoming = req.headers['x-correlation-id'];
  const id       = sanitiseCorrelationId(incoming) ?? randomUUID();

  // Attach to request — readable by all downstream middleware and controllers.
  req.correlationId = id;

  // Echo on response — frontend includes this in error reports.
  // res.set() is safe to call before any route handler has run.
  res.set('X-Correlation-ID', id);

  next();
}

module.exports = correlationId;