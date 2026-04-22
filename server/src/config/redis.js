/**
 * server/src/config/redis.js
 *
 * TASK 5.3 — Dead Code Audit Result: DOCUMENTED STUB (not removed)
 *
 * ─── AUDIT FINDING ────────────────────────────────────────────────────────────
 *
 * This file is a NO-OP placeholder. It is NOT imported by cache.service.js
 * or any other active module in the current codebase. cache.service.js uses
 * node-cache (in-process memory) exclusively and explicitly documents why:
 *
 *   "node-cache runs in the same Node.js process — zero config, zero latency,
 *    zero external dependency. Works on Render free tier immediately."
 *
 * The comment in cache.service.js already acknowledges this file:
 *   "redis.js is currently a stub (no-op). Wiring real Redis requires an
 *    external service, environment variables, and connection management."
 *
 * ─── WHY NOT DELETE IT ────────────────────────────────────────────────────────
 *
 * Deleting this file right now would be premature. Phase 3 Task 3.4 specifies
 * a Bull/Redis background queue for session picks at scale. When that is
 * implemented, this file becomes the Redis client module. Keeping it as a
 * documented stub with a clear upgrade path is better than recreating it.
 *
 * ─── WHAT CHANGED IN THIS VERSION ────────────────────────────────────────────
 *
 * Before: 9 lines, no documentation, no-op with no explanation.
 * After:  Full JSDoc, clear stub contract, upgrade instructions, import safety.
 *
 * ─── UPGRADE PATH (when Redis is needed) ─────────────────────────────────────
 *
 * Step 1: Add Redis to the project.
 *
 *   Option A — Upstash (serverless Redis, works on Render free tier):
 *     npm install @upstash/redis
 *     const { Redis } = require('@upstash/redis');
 *     const client = new Redis({
 *       url:   process.env.UPSTASH_REDIS_REST_URL,
 *       token: process.env.UPSTASH_REDIS_REST_TOKEN,
 *     });
 *
 *   Option B — ioredis (traditional Redis, requires a Redis server):
 *     npm install ioredis
 *     const Redis = require('ioredis');
 *     const client = new Redis(process.env.REDIS_URL);
 *
 * Step 2: Replace the no-op methods below with real Redis calls.
 *         The interface (get/set/del) stays identical — callers don't change.
 *
 * Step 3: Add UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (or REDIS_URL)
 *         to server/src/config/validateEnv.js required vars list.
 *
 * Step 4: Update cache.service.js to import this module instead of node-cache
 *         when process.env.REDIS_URL is set (can be detected at startup).
 *
 * ─── CURRENT STATUS ───────────────────────────────────────────────────────────
 *
 * Status:   STUB — all methods are no-ops that return null/undefined.
 * Used by:  Nothing in the current codebase.
 * Safe to:  Leave in place (it does nothing), import it (safe no-ops),
 *           or remove it (no downstream breakage). Keeping as upgrade anchor.
 *
 * Do NOT:   Connect real infrastructure to this without implementing the
 *           connection error handling, retry logic, and health check probe
 *           described in Phase 4 Task 4.3 (GET /ready dependency check).
 */

'use strict';

// ─── Stub client ──────────────────────────────────────────────────────────────
// All methods are async no-ops that match the interface of a real Redis client.
// Replace these with real Redis calls when upgrading (see UPGRADE PATH above).

/**
 * Retrieve a value by key.
 * @param   {string}       key
 * @returns {Promise<null>}     Always null in stub mode.
 */
async function get(key) { // eslint-disable-line no-unused-vars
  return null;
}

/**
 * Store a value with an optional TTL.
 * @param   {string}       key
 * @param   {*}            value
 * @param   {number}       [ttl]  TTL in seconds (ignored in stub mode).
 * @returns {Promise<null>}       Always null in stub mode.
 */
async function set(key, value, ttl) { // eslint-disable-line no-unused-vars
  return null;
}

/**
 * Delete a key.
 * @param   {string}       key
 * @returns {Promise<null>}     Always null in stub mode.
 */
async function del(key) { // eslint-disable-line no-unused-vars
  return null;
}

/**
 * Ping the Redis server to check connectivity.
 * Used by GET /ready health probe.
 * @returns {Promise<boolean>} Always false in stub mode (Redis not connected).
 */
async function ping() {
  return false;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  get,
  set,
  del,
  ping,

  /**
   * Whether this module is backed by a real Redis connection.
   * Callers can use this flag to decide whether to use Redis or fall back
   * to in-memory cache:
   *
   *   const redis = require('./redis');
   *   if (redis.isConnected) { ... } else { // use node-cache }
   *
   * Set to true only after a real Redis client is wired up.
   * @type {boolean}
   */
  isConnected: false,
};