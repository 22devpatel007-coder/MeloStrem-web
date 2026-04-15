/**
 * server/src/services/cache.service.js
 *
 * Production-grade in-memory TTL cache for MeloStream.
 *
 * PHASE 3 — TASK 3.1: In-Memory Cache with TTL
 *
 * Why node-cache instead of Redis:
 *   • redis.js is currently a stub (no-op). Wiring real Redis requires an
 *     external service, environment variables, and connection management.
 *   • node-cache runs in the same Node.js process — zero config, zero latency,
 *     zero external dependency. Works on Render free tier immediately.
 *   • For a single-process Express server (one Render dyno), in-memory cache
 *     is correct and sufficient. Cache is per-process, which is fine because
 *     Render routes all traffic to one instance at this scale.
 *   • Upgrade path: when MeloStream scales to multiple dynos, swap the
 *     NodeCache instance for an ioredis/Upstash client. The interface
 *     (get/set/del/delPattern) stays identical — controllers don't change.
 *
 * What is cached (public/shared data only — never user-scoped):
 *   songs:list:<limit>:<cursor>        60s  — paginated song list pages
 *   songs:id:<songId>                 300s  — individual song by ID
 *   artists:id:<artistId>             600s  — artist metadata
 *   artists:songs:<id>:<limit>:<cur>   60s  — paginated artist songs
 *   albums:id:<albumId>               600s  — album metadata
 *   albums:songs:<albumId>            300s  — full album song list
 *   search:<query>:<limit>             30s  — search results
 *   playlists:admin:public            120s  — public admin playlist listing
 *
 * What is NEVER cached:
 *   • user-scoped data (liked songs, user playlists, session picks)
 *   • admin-only listing with mutation access (getAdminPlaylists)
 *   • getSongsBatch / checkDuplicate (admin tools, need fresh data)
 *
 * Cache failure contract:
 *   Every public method catches its own errors and returns null/false.
 *   A cache read failure is treated as a cache miss.
 *   A cache write or delete failure is logged but never throws.
 *   The request always falls through to Firestore on any cache error.
 */

'use strict';

const NodeCache = require('node-cache');
const logger    = require('../utils/logger');

// ── TTL constants (seconds) ───────────────────────────────────────────────────
// Exported so controllers reference canonical values — no magic numbers.
const TTL = {
  SONGS_LIST:    60,   // song list pages — short TTL, users expect near-realtime
  SONG:         300,   // individual song — 5 min, metadata changes infrequently
  ARTIST:       600,   // artist metadata — 10 min, rarely changes
  ARTIST_SONGS:  60,   // artist song list — short, new uploads should appear fast
  ALBUM:        600,   // album metadata — 10 min
  ALBUM_SONGS:  300,   // album song list — 5 min
  SEARCH:        30,   // search results — very short, new uploads must appear
  PLAYLISTS:    120,   // public admin playlists — 2 min
};

// ── node-cache instance ───────────────────────────────────────────────────────
// checkperiod: background sweep every 120s to evict expired keys.
// useClones: false — return references, not deep copies. This is safe because
//   cached values are plain JSON objects that callers never mutate in place.
//   Disabling clones avoids the serialization overhead on every cache read.
// stdTTL: 0 = no default TTL — every set() call must pass an explicit TTL.
//   This prevents accidental forever-cached entries if a caller forgets TTL.
const _cache = new NodeCache({
  stdTTL:      0,
  checkperiod: 120,
  useClones:   false,
});

// ── Logging ───────────────────────────────────────────────────────────────────
// Log cache hits only in development — at 1000 req/s production logs would
// be flooded with cache hit noise. Misses and errors always logged.
const IS_DEV = process.env.NODE_ENV !== 'production';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Read a value from cache.
 * Returns the cached value on hit, or null on miss/error.
 * Never throws — a failed read is always a cache miss.
 *
 * @param {string} key
 * @returns {any|null}
 */
function get(key) {
  try {
    const value = _cache.get(key);
    // NodeCache returns undefined for a miss (not null).
    if (value === undefined) {
      return null; // cache miss — caller falls through to Firestore
    }
    if (IS_DEV) {
      logger.debug(`[cache] HIT  ${key}`);
    }
    return value;
  } catch (err) {
    // NodeCache.get() can throw if the key is malformed or internal state is
    // corrupted. Treat as a miss — never block the request.
    logger.warn(`[cache] read error for key "${key}":`, { error: err.message });
    return null;
  }
}

/**
 * Write a value to cache with an explicit TTL.
 * Silent no-op on error — never throws.
 *
 * @param {string} key
 * @param {any}    value     — must be JSON-serializable
 * @param {number} ttlSeconds
 * @returns {void}
 */
function set(key, value, ttlSeconds) {
  try {
    if (value === undefined || value === null) {
      // Never cache null/undefined — that would turn a Firestore miss into a
      // cached "not found" that outlives the TTL. Caller should not hit this
      // path, but guard anyway.
      return;
    }
    _cache.set(key, value, ttlSeconds);
    if (IS_DEV) {
      logger.debug(`[cache] SET  ${key}  (ttl=${ttlSeconds}s)`);
    }
  } catch (err) {
    logger.warn(`[cache] write error for key "${key}":`, { error: err.message });
  }
}

/**
 * Delete a single key from cache.
 * Silent no-op on error — never throws.
 *
 * @param {string} key
 * @returns {void}
 */
function del(key) {
  try {
    _cache.del(key);
    logger.debug(`[cache] DEL  ${key}`);
  } catch (err) {
    logger.warn(`[cache] delete error for key "${key}":`, { error: err.message });
  }
}

/**
 * Delete all keys whose names START WITH the given prefix.
 * Used for pattern-based invalidation (e.g. "songs:list:" prefix to clear
 * all paginated song list pages when a song is created/updated/deleted).
 *
 * node-cache has no native pattern delete. We iterate all keys in O(n)
 * where n = total cached keys. At the cache sizes used here (< 10k keys
 * at any point), this is well under 1ms and completely acceptable.
 *
 * @param {string} prefix
 * @returns {void}
 */
function delPattern(prefix) {
  try {
    const keys    = _cache.keys();
    const matches = keys.filter((k) => k.startsWith(prefix));
    if (matches.length === 0) return;
    _cache.del(matches);
    logger.debug(`[cache] DEL pattern "${prefix}*" — ${matches.length} key(s) removed`);
  } catch (err) {
    logger.warn(`[cache] delPattern error for prefix "${prefix}":`, { error: err.message });
  }
}

/**
 * Return current cache statistics. Used by the enriched /health endpoint
 * (Phase 4, Task 4.3) to surface cache performance in health checks.
 *
 * @returns {{ keys: number, hits: number, misses: number, ksize: number, vsize: number }}
 */
function stats() {
  try {
    return _cache.getStats();
  } catch (_) {
    return { keys: 0, hits: 0, misses: 0, ksize: 0, vsize: 0 };
  }
}

// ── Module exports ────────────────────────────────────────────────────────────
module.exports = { get, set, del, delPattern, stats, TTL };