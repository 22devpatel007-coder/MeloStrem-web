/**
 * server/src/utils/logger.js
 *
 * PHASE 4 — TASK 4.1: Structured logging with correlationId support.
 *
 * Changes from previous version:
 *   - Production format is now STRUCTURED JSON (NODE_ENV=production).
 *     Log aggregators (Datadog, CloudWatch, Papertrail, etc.) require JSON to
 *     index fields. The previous simple() format was unstructured text — it could
 *     not be queried by correlationId, userId, or error code.
 *   - Development format remains pretty-printed colorized text for readability
 *     in local terminals (unchanged developer experience).
 *   - Added a custom JSON formatter that promotes the Winston `message` field
 *     and flattens the splat metadata (the second argument to logger.info/warn/
 *     error) into the top-level JSON object. This means every log line in
 *     production is a single JSON object with flat, indexable fields:
 *       { level, timestamp, message, correlationId, userId, path, ... }
 *     Log aggregators can create dashboards and alerts on any of these fields.
 *   - No change to transports: file transport (error.log + combined.log) and
 *     console transport. Behaviour is identical; only the format differs.
 *
 * How correlationId flows into logs:
 *   Controllers pass it in the metadata object:
 *     logger.info('getAllSongs hit', { correlationId: req.correlationId, userId: req.user?.uid })
 *   The productionFormat printf below writes that as a top-level JSON field.
 *   In development, simple() already prints all metadata keys inline.
 *
 * Log levels (unchanged):
 *   error → logs/error.log + combined.log + console (dev only)
 *   warn  → combined.log + console (dev only)
 *   info  → combined.log + console (dev only)
 *
 * File transport behaviour (unchanged):
 *   logs/ directory is created on startup if missing (fs.mkdirSync with recursive).
 *   error.log: only 'error' level entries.
 *   combined.log: all levels.
 */

"use strict";

const winston = require("winston");
require('winston-daily-rotate-file');
const fs = require("fs");

// Ensure logs/ directory exists before any transport tries to write.
// recursive:true is a no-op if the directory already exists — safe to call
// every time without try/catch.
fs.mkdirSync("logs", { recursive: true });

// ── Production JSON format ────────────────────────────────────────────────────
//
// Winston's default json() format nests the splat metadata inside a `meta`
// key, which breaks Datadog/CloudWatch field indexing. This custom printf
// flattens metadata into the top level so every field is directly queryable.
//
// Output shape (one line per log entry):
// {
//   "level":         "info",
//   "timestamp":     "2026-04-16T10:23:01.123Z",
//   "message":       "getAllSongs hit",
//   "correlationId": "550e8400-e29b-41d4-a716-446655440000",
//   "userId":        "uid_abc123",
//   "path":          "/api/songs",
//   "method":        "GET"
// }
//
// The `level` field from printf already has Winston colour codes stripped
// because we do NOT add colorize() to the production format chain.
// ─────────────────────────────────────────────────────────────────────────────
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }), // ensures err.stack is serialised
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    // `meta` is everything passed as the second arg to logger.info/warn/error.
    // Spread it flat into the JSON object so correlationId, userId, etc. are
    // top-level fields, not nested inside a "meta" wrapper.
    const entry = {
      level,
      timestamp,
      message,
      ...meta,
      // Only include stack if it was set (non-operational / programmer errors).
      ...(stack ? { stack } : {}),
    };
    return JSON.stringify(entry);
  }),
);

// ── Development pretty format ─────────────────────────────────────────────────
//
// Unchanged from previous version: colorized, single-line output readable in
// a local terminal. metadata keys are printed inline by simple().
// ─────────────────────────────────────────────────────────────────────────────
const developmentFormat = winston.format.combine(
  winston.format.errors({ stack: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, stack, ...meta }) => {
    const entry = {
      level,
      timestamp,
      message,
      ...meta,
      ...(stack ? { stack } : {}),
    };
    // Single line for INFO, pretty JSON block for WARN/ERROR
const metaStr = Object.keys(meta).length > 0
  ? '\n' + JSON.stringify(meta, null, 2)
  : '';
return `${timestamp} ${level.toUpperCase().padEnd(5)} ${message}${metaStr}`;
  }),
);

// ── Logger instance ───────────────────────────────────────────────────────────
const isProduction = process.env.NODE_ENV === "production";

const logger = winston.createLogger({
  level: "info",

  // Format is chosen at module load time — one format per environment.
  // This avoids the overhead of a conditional on every log call.
  format: isProduction ? productionFormat : developmentFormat,

  transports: [
    // error.log: only error-level entries — easy to tail in production ops.
    new winston.transports.DailyRotateFile({
  filename:    'logs/error-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  level:       'error',
  maxSize:     '20m',
  maxFiles:    '14d',
}),
new winston.transports.DailyRotateFile({
  filename:    'logs/combined-%DATE%.log',
  datePattern: 'YYYY-MM-DD',
  maxSize:     '20m',
  maxFiles:    '14d',
}),
  ],
});

// Console transport: always add in non-production so local dev and CI/CD
// pipeline output is visible without tailing a log file.
// In production: Render/Heroku/Railway collect stdout already — adding a
// second console transport would double-print every log line in prod.
if (!isProduction) {
  logger.add(
    new winston.transports.Console({
      // Format is already set on the logger instance above.
      // No need to set format here — the instance format applies.
    }),
  );
}

module.exports = logger;
