/**
 * server/src/utils/retryFirestore.js
 *
 * PERMANENT FIX — Firestore ECONNRESET / socket hang up / TLS drop errors
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Root cause:
 *   Render.com (and similar PaaS platforms) idle-close TCP connections after
 *   roughly 10 minutes of no traffic. Firebase Admin SDK's REST transport
 *   (preferRest: true) reuses HTTP keep-alive sockets. When Render silently
 *   kills an idle socket, the next Firestore call hits the dead socket and gets:
 *
 *     ECONNRESET   — remote closed the connection mid-stream
 *     socket hang up — server closed before response was received
 *     EHOSTUNREACH — route unreachable (IPv6 fallback issue on Render)
 *
 *   The Firebase SDK does NOT automatically retry these transport-layer errors.
 *   Every Firestore call was a single attempt with zero recovery.
 *
 * Fix — retryFirestore(fn, opts):
 *   Wraps any async Firestore operation with exponential backoff + full jitter.
 *   Only retries on known transient network/transport error codes.
 *   Non-retryable errors (NOT_FOUND, PERMISSION_DENIED, bad data, etc.)
 *   are re-thrown immediately without wasting retry budget.
 *
 * Algorithm: "Full Jitter" exponential backoff (AWS architecture blog pattern)
 *   delay = random(0, min(CAP, BASE * 2^attempt))
 *   This avoids thundering herd when multiple requests fail simultaneously
 *   (e.g. after a cold start, all in-flight requests fail at once).
 *
 * Defaults (tuned for Render free tier):
 *   maxAttempts : 4     → 3 retries before giving up
 *   baseDelayMs : 150   → first retry after ~0–150ms
 *   maxDelayMs  : 3000  → cap at 3s so requests don't time out waiting
 *
 * Usage:
 *   const { retryFirestore } = require('../utils/retryFirestore');
 *
 *   // wrap any single Firestore call
 *   const doc = await retryFirestore(() => db.collection('users').doc(uid).get());
 *
 *   // wrap a multi-step operation (entire lambda is retried atomically)
 *   const songs = await retryFirestore(async () => {
 *     const snap = await db.collection('songs').orderBy('createdAt').limit(30).get();
 *     return snap.docs.map(formatDoc);
 *   });
 */

'use strict';

const logger = require('./logger');

// ── Transient error codes that are safe to retry ──────────────────────────────
// These are all transport / connection layer failures — the Firestore
// operation itself never reached the server or was interrupted mid-flight.
const RETRYABLE_CODES = new Set([
  'ECONNRESET',       // TCP connection reset by peer
  'ECONNREFUSED',     // connection refused (server not ready yet)
  'ECONNABORTED',     // connection aborted mid-flight
  'EPIPE',            // broken pipe — write to closed socket
  'ETIMEDOUT',        // connection or read timed out
  'EHOSTUNREACH',     // no route to host (IPv6 → IPv4 fallback issue on Render)
  'ENETUNREACH',      // network unreachable
  'EAI_AGAIN',        // DNS temporary failure
  'UNAVAILABLE',      // gRPC status: service temporarily unavailable
  'DEADLINE_EXCEEDED',// gRPC status: deadline exceeded
  'INTERNAL',         // gRPC status: internal error (often a transport fault)
  'UNKNOWN',          // gRPC status: unknown (often wraps ECONNRESET)
]);

// HTTP status codes that indicate a transient server/infrastructure fault
const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

/**
 * isRetryable(err) — determines whether an error is a transient failure
 * that is safe to retry, vs a permanent error we should surface immediately.
 *
 * @param {Error} err
 * @returns {boolean}
 */
function isRetryable(err) {
  if (!err) return false;

  // gRPC/Firebase Admin SDK surface the status code as err.code
  if (err.code && RETRYABLE_CODES.has(err.code)) return true;

  // HTTP-level errors (Firebase REST transport)
  if (err.status && RETRYABLE_HTTP_STATUSES.has(err.status)) return true;
  if (err.statusCode && RETRYABLE_HTTP_STATUSES.has(err.statusCode)) return true;

  // node-fetch / undici / got wrap the root cause in err.cause
  if (err.cause && isRetryable(err.cause)) return true;

  // String matching for errors that don't set a code (e.g. raw fetch errors)
  const msg = (err.message || '').toLowerCase();
  if (
    msg.includes('econnreset') ||
    msg.includes('socket hang up') ||
    msg.includes('network socket disconnected') ||
    msg.includes('client network socket disconnected') ||
    msg.includes('read econnreset') ||
    msg.includes('write econnreset') ||
    msg.includes('ehostunreach') ||
    msg.includes('etimedout') ||
    msg.includes('econnrefused') ||
    msg.includes('no connection established') ||
    msg.includes('failed, reason:')   // node-fetch wraps transport errors with this
  ) {
    return true;
  }

  return false;
}

/**
 * sleep(ms) — promise-based delay
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * retryFirestore(fn, opts) — retry wrapper for Firestore operations
 *
 * @param {() => Promise<T>} fn        Async function that performs a Firestore op
 * @param {object}           [opts]
 * @param {number}           [opts.maxAttempts=4]   Total attempts (1 + retries)
 * @param {number}           [opts.baseDelayMs=150] Base backoff delay in ms
 * @param {number}           [opts.maxDelayMs=3000] Maximum backoff cap in ms
 * @param {string}           [opts.label='']        Log label for diagnostics
 * @returns {Promise<T>}
 */
async function retryFirestore(fn, opts = {}) {
  const {
    maxAttempts = 4,
    baseDelayMs = 150,
    maxDelayMs  = 3000,
    label       = '',
  } = opts;

  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      const retryable = isRetryable(err);

      if (!retryable || attempt === maxAttempts) {
        // Non-retryable OR exhausted — let caller handle it
        if (attempt > 1) {
          logger.error(`[retryFirestore] ${label} giving up after ${attempt} attempt(s):`, {
            code: err.code,
            message: err.message,
          });
        }
        throw err;
      }

      // Full-jitter exponential backoff:
      // delay = random(0, min(maxDelayMs, baseDelayMs * 2^(attempt-1)))
      const expCap = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt - 1));
      const delay  = Math.floor(Math.random() * expCap);

      logger.warn(`[retryFirestore] ${label} attempt ${attempt} failed (${err.code || err.message}). Retrying in ${delay}ms...`);

      await sleep(delay);
    }
  }

  // Should never reach here, but satisfies TypeScript / linters
  throw lastErr;
}

module.exports = { retryFirestore, isRetryable };