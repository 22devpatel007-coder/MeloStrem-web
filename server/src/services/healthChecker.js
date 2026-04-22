/**
 * server/src/services/healthChecker.js
 *
 * PHASE 4 — TASK 4.3: Detailed Health and Readiness Probes
 *
 * Owns all dependency probe logic for /ready.
 * Deliberately isolated from index.js so:
 *   - Each probe can be unit-tested independently with mock dependencies.
 *   - Adding a new dependency check (Redis, Algolia, etc.) requires changing
 *     only this file — index.js stays untouched.
 *   - Circuit-breaker state and probe caching live in one place.
 *
 * ── Probe Design Principles ──────────────────────────────────────────────────
 *
 *  1. Lightweight: Each probe does the minimum work to confirm the dependency
 *     is reachable. Firestore lists one document (no full scan). Cloudinary
 *     pings the API (no asset fetch). Neither probe mutates data.
 *
 *  2. Time-bounded: Every probe has a hard timeout (PROBE_TIMEOUT_MS).
 *     A hung dependency never hangs the /ready response indefinitely.
 *     Render/k8s readiness check has its own timeout too, but we must not
 *     rely on that — a hung probe would block the HTTP worker thread.
 *
 *  3. Cached: Results are cached for PROBE_CACHE_TTL_MS (10s).
 *     /ready is called by Render every ~5s during deploys and by uptime
 *     monitors every 30s. Without caching, that is a continuous trickle of
 *     Firestore + Cloudinary API calls. With caching, probe calls collapse
 *     to at most 1 per 10 seconds per dependency.
 *
 *  4. Non-throwing: probeFirestore() and probeCloudinary() always resolve —
 *     never reject. Errors are caught internally and returned as
 *     { ok: false, error: '<safe message>' }. This keeps the /ready handler
 *     simple and prevents unhandled-rejection crashes.
 *
 *  5. Safe error messages: Probe errors logged to Winston include full detail.
 *     The value surfaced in the /ready JSON response is a safe, sanitised
 *     string — never a raw Firebase error, stack trace, or internal IP.
 *
 * ── Cache Behaviour ──────────────────────────────────────────────────────────
 *
 *  Each probe result is stamped with Date.now(). On the next /ready call,
 *  if the stamp is within PROBE_CACHE_TTL_MS, the cached result is returned
 *  immediately — no network call. After the TTL expires, the next call
 *  triggers a fresh probe and updates the cache.
 *
 *  Concurrency: if two /ready requests arrive simultaneously after cache
 *  expiry, both will trigger their own probe call. This is intentional —
 *  the probe is lightweight and a mutex would add unnecessary complexity.
 *  At /ready call frequency (every 5–30s), this race is effectively never hit.
 */

'use strict';

const logger = require('../utils/logger');

// ── Constants ─────────────────────────────────────────────────────────────────

/** Hard timeout for each individual dependency probe (ms). */
const PROBE_TIMEOUT_MS = 5_000;

/**
 * How long to cache a successful OR failed probe result (ms).
 * 10s means at most 6 Firestore calls per minute from /ready.
 * Render deploy polling is every ~5s — two consecutive polls may share
 * a cached result, which is acceptable. The infra's own timeout governs
 * when it gives up on the instance, not our probe frequency.
 */
const PROBE_CACHE_TTL_MS = 10_000;

// ── Probe result cache ────────────────────────────────────────────────────────

/**
 * @typedef {{ ok: boolean, error?: string }} ProbeResult
 * @typedef {{ result: ProbeResult, at: number }} CachedProbe
 */

/** @type {CachedProbe | null} */
let firestoreCache = null;

/** @type {CachedProbe | null} */
let cloudinaryCache = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wraps a probe promise with a hard timeout.
 * Resolves to ProbeResult — never rejects.
 *
 * @param {string} name - Dependency name for logging.
 * @param {Promise<ProbeResult>} probePromise
 * @returns {Promise<ProbeResult>}
 */
async function withTimeout(name, probePromise) {
  let timer;

  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => {
      resolve({ ok: false, error: 'probe timed out' });
    }, PROBE_TIMEOUT_MS);
    // .unref() so a hung probe timer never keeps the process alive after
    // all other work is done (e.g. during graceful shutdown).
    if (timer.unref) timer.unref();
  });

  try {
    const result = await Promise.race([probePromise, timeout]);
    return result;
  } catch (err) {
    // probePromise should never reject (errors are caught inside each probe),
    // but this is a final safety net.
    logger.error(`[HealthChecker] ${name} probe threw unexpectedly:`, {
      error: err.message,
    });
    return { ok: false, error: 'probe threw unexpectedly' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns a cached probe result if still within TTL, or null if stale/absent.
 *
 * @param {CachedProbe | null} cache
 * @returns {ProbeResult | null}
 */
function fromCache(cache) {
  if (!cache) return null;
  if (Date.now() - cache.at < PROBE_CACHE_TTL_MS) return cache.result;
  return null;
}

// ── Firestore probe ───────────────────────────────────────────────────────────

/**
 * Probes Firestore by listing at most one document from the _health collection.
 *
 * Design notes:
 *   - Uses _health collection (leading underscore = private convention).
 *     The collection does not need to exist — a Firestore query against a
 *     non-existent collection returns an empty result, not an error. This
 *     means the probe works on a fresh project with no data at all.
 *   - limit(1) ensures zero full-collection scans regardless of collection size.
 *   - No document is read or written — read-only, zero mutation risk.
 *   - The Admin SDK call goes through the same firestoreHttpAgent keepalive
 *     agent configured in config/firebase.js, so the probe exercises the
 *     exact same connection path that real requests use.
 *
 * @param {import('firebase-admin').firestore.Firestore} db
 * @returns {Promise<ProbeResult>}
 */
async function runFirestoreProbe(db) {
  try {
    await db.collection('_health').limit(1).get();
    return { ok: true };
  } catch (err) {
    // Log full detail for developers. Surface only a safe string to callers.
    logger.error('[HealthChecker] Firestore probe failed:', {
      error:   err.message,
      code:    err.code,
    });
    return { ok: false, error: 'firestore unreachable' };
  }
}

/**
 * Public Firestore probe with caching and timeout.
 *
 * @param {import('firebase-admin').firestore.Firestore} db
 * @returns {Promise<ProbeResult>}
 */
async function probeFirestore(db) {
  const cached = fromCache(firestoreCache);
  if (cached) return cached;

  const result = await withTimeout('Firestore', runFirestoreProbe(db));

  firestoreCache = { result, at: Date.now() };
  return result;
}

// ── Cloudinary probe ──────────────────────────────────────────────────────────

/**
 * Probes Cloudinary by calling the ping endpoint.
 *
 * Design notes:
 *   - cloudinary.api.ping() sends a lightweight GET to the Cloudinary API
 *     and expects { status: 'ok' }. It does NOT fetch any assets, consume
 *     any credits, or modify anything.
 *   - The Cloudinary SDK is already initialised with credentials in
 *     config/cloudinary.js. The same configured instance is used here —
 *     so a probe failure also signals a credential or config problem,
 *     not just a network issue.
 *   - callback-style SDK converted to Promise explicitly (no util.promisify
 *     needed — the SDK also supports Promise when no callback is passed).
 *
 * @param {object} cloudinary - Initialised Cloudinary v2 instance.
 * @returns {Promise<ProbeResult>}
 */
async function runCloudinaryProbe(cloudinary) {
  try {
    await cloudinary.api.ping();
    return { ok: true };
  } catch (err) {
    logger.error('[HealthChecker] Cloudinary probe failed:', {
      error:      err.message,
      http_code:  err.http_code,
    });
    return { ok: false, error: 'cloudinary unreachable' };
  }
}

/**
 * Public Cloudinary probe with caching and timeout.
 *
 * @param {object} cloudinary - Initialised Cloudinary v2 instance.
 * @returns {Promise<ProbeResult>}
 */
async function probeCloudinary(cloudinary) {
  const cached = fromCache(cloudinaryCache);
  if (cached) return cached;

  const result = await withTimeout('Cloudinary', runCloudinaryProbe(cloudinary));

  cloudinaryCache = { result, at: Date.now() };
  return result;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Runs all dependency probes in parallel and returns a structured readiness result.
 *
 * Probes run concurrently (Promise.all) — total /ready latency is bounded by
 * the slowest individual probe (max PROBE_TIMEOUT_MS), not the sum of all probes.
 *
 * @param {object} deps
 * @param {import('firebase-admin').firestore.Firestore} deps.db
 * @param {object} deps.cloudinary - Initialised Cloudinary v2 instance.
 * @returns {Promise<{
 *   ready: boolean,
 *   checks: {
 *     firestore: 'ok' | 'error',
 *     cloudinary: 'ok' | 'error'
 *   },
 *   errors: Record<string, string>
 * }>}
 */
async function checkReadiness({ db, cloudinary }) {
  const [firestoreResult, cloudinaryResult] = await Promise.all([
    probeFirestore(db),
    probeCloudinary(cloudinary),
  ]);

  const ready = firestoreResult.ok && cloudinaryResult.ok;

  const checks = {
    firestore:  firestoreResult.ok  ? 'ok' : 'error',
    cloudinary: cloudinaryResult.ok ? 'ok' : 'error',
  };

  // Only include the errors object when there is something to report.
  // This keeps the happy-path /ready response clean and small.
  const errors = {};
  if (!firestoreResult.ok  && firestoreResult.error)  errors.firestore  = firestoreResult.error;
  if (!cloudinaryResult.ok && cloudinaryResult.error) errors.cloudinary = cloudinaryResult.error;

  return {
    ready,
    checks,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  };
}

/**
 * Resets the probe cache. Used in tests to force fresh probes between test cases.
 * Not called in production code.
 */
function _resetCacheForTesting() {
  firestoreCache  = null;
  cloudinaryCache = null;
}

module.exports = {
  checkReadiness,
  probeFirestore,
  probeCloudinary,
  _resetCacheForTesting,  // exported for tests only
};