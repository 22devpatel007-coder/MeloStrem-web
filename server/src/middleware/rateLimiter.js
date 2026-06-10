'use strict';
/**
 * server/src/middleware/rateLimiter.js
 *
 * Phase 3 — Task 3.2: Single-source rate limiter policy.
 *
 * ALL rate limiters for the entire application are defined here as named
 * exports. Route files import from this module — they never define inline
 * rateLimit() instances.
 *
 * Changes from previous version:
 *   PRESERVED (zero config changes):
 *     - generalLimiter    — 500 req / 15 min   (global, mounted in index.js)
 *     - uploadLimiter     — 20 req  / 60 min   (song upload endpoints)
 *     - searchLimiter     — 30 req  / 1 min    (GET /api/search)
 *
 *   NEW (moved from inline route-file definitions):
 *     - adminMutationLimiter   — 20 req / 15 min  (songs POST/PATCH/DELETE)
 *     - duplicateCheckLimiter  — 30 req / 15 min  (songs duplicate-check)
 *     - artistsLimiter         — 100 req / 15 min (artists routes)
 *     - albumsLimiter          — 100 req / 15 min (albums routes)
 *     - playlistsLimiter       — 60 req  / 1 min  (playlists admin listing)
 *
 *   BUG-017 FIX:
 *     - errorReportLimiter raised from 10 req/min to 20 req/min.
 *       The client flush interval was raised to 7 000 ms (~8.5 flushes/min
 *       max). 20 req/min gives comfortable headroom for visibilitychange
 *       flushes and multiple tabs sharing an IP without ever hitting the
 *       wall under normal error conditions. The client-side circuit breaker
 *       (immediate open on 429) is the primary abuse defence; this limiter
 *       remains as the server-side safety net.
 *
 * Policy notes (why each limit was chosen):
 *
 *   generalLimiter (500/15m):
 *     Baseline protection for all public endpoints. High enough to never
 *     impact normal users; low enough to slow down scrapers.
 *
 *   uploadLimiter (20/60m):
 *     Audio + cover upload is expensive (Cloudinary + Firestore write).
 *     20 per hour is generous for any legitimate admin workflow.
 *
 *   searchLimiter (30/1m):
 *     Search hits Firestore on every keystroke unless debounce fires.
 *     30/min = 1 request every 2 seconds — comfortably above the 400ms
 *     useSearch debounce, below any scraping threshold.
 *
 *   adminMutationLimiter (20/15m):
 *     Songs POST/PATCH/DELETE require Cloudinary upload + Firestore write.
 *     20/15m matches the previous inline definition in songs.routes.js exactly.
 *     Consequence of hitting: admin workflows slow down; not a user-facing issue.
 *
 *   duplicateCheckLimiter (30/15m):
 *     Duplicate check is a lightweight Firestore read. 30/15m matches the
 *     previous inline definition in songs.routes.js exactly.
 *
 *   artistsLimiter (100/15m):
 *     Public read-only endpoints. Matches previous inline definition in
 *     artists.routes.js exactly. Same cap as generalLimiter but kept separate
 *     so artists and albums have independent counters — a burst on one does
 *     not consume the other's budget. If a shared counter is ever desired,
 *     export a single instance and import it in both route files.
 *
 *   albumsLimiter (100/15m):
 *     Same rationale as artistsLimiter. Matches previous inline definition
 *     in albums.routes.js exactly. Independent counter from artistsLimiter.
 *
 *   playlistsLimiter (60/1m):
 *     GET /api/playlists/admin is a public listing endpoint hit on every
 *     library page load. 60/min = 1/sec per IP; generous for real users,
 *     restrictive for scrapers. Matches previous inline definition exactly.
 *
 *   errorReportLimiter (20/1m):
 *     POST /api/errors/report receives batched frontend error payloads.
 *     Client flushes at most ~8.5 times/min (7 000 ms interval). 20/min
 *     gives a 2x safety margin above the normal client flush rate. The
 *     client-side 429 circuit breaker (opens immediately on first 429) is
 *     the primary throttle; this limiter is the server-side safety net.
 *
 * SECURITY NOTE — why separate artistsLimiter and albumsLimiter:
 *   Previously both route files defined `const searchLimiter = rateLimit(...)`
 *   locally. These were separate objects with separate counters, meaning an
 *   attacker could get 200 effective requests per 15 min by alternating
 *   between /api/artists and /api/albums endpoints.
 *
 *   The fix here keeps them as separate named exports (independent counters)
 *   but makes the policy explicit and visible in one place. If the security
 *   requirement changes to a SHARED counter across both domains, replace both
 *   imports in the route files with a single `publicReadLimiter` export from
 *   this file. Document that decision here when made.
 */

const rateLimit = require('express-rate-limit');
const activity = require('../services/activityLogger');
// ── Helpers ───────────────────────────────────────────────────────────────────
// Shared config defaults so all limiters use identical header/response shape.
// Individual limiters only override what differs (windowMs, max, message.error).
const base = {
  standardHeaders: true,   // Return RateLimit-* headers per RFC 6585
  legacyHeaders:   false,  // Suppress X-RateLimit-* headers
};

// ── Global ────────────────────────────────────────────────────────────────────

/**
 * generalLimiter — applied globally in server/src/index.js.
 * 500 requests per 15 minutes per IP.
 */
const generalLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max:      500,
  handler: (req, res) => {
  activity.rate_limit_triggered(req, { limiter: 'suggestionsLimiter', path: req.path });
  res.status(429).json({ success: false, error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' } });
},
});

// ── Upload ────────────────────────────────────────────────────────────────────

/**
 * uploadLimiter — song audio + cover upload endpoints.
 * 20 requests per 60 minutes per IP.
 */
const uploadLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000,
  max:      20,
  message:  {
    success: false,
    error: { message: 'Upload limit exceeded', code: 'UPLOAD_LIMIT_EXCEEDED' },
  },
});

// ── ZIP bulk upload ───────────────────────────────────────────────────────────

/**
 * zipUploadLimiter — POST /api/playlists/upload-song (ZIP bulk flow only).
 * 350 requests per 30 minutes per IP.
 * Keyed by uid via keyGenerator so one admin's bulk upload never
 * consumes another admin's budget.
 */
const zipUploadLimiter = rateLimit({
  ...base,
  windowMs: 30 * 60 * 1000,
  max:      350,
  keyGenerator: (req) => req.user?.uid || req.ip,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  message:  {
    success: false,
    error: { message: 'Bulk upload rate limit exceeded', code: 'BULK_UPLOAD_LIMIT_EXCEEDED' },
  },
});

// ── Search ────────────────────────────────────────────────────────────────────

/**
 * searchLimiter — GET /api/search.
 * 30 requests per 1 minute per IP.
 */
const searchLimiter = rateLimit({
  ...base,
  windowMs: 1 * 60 * 1000,
  max:      30,
  message:  {
    success: false,
    error: { message: 'Search rate limit exceeded', code: 'SEARCH_LIMIT_EXCEEDED' },
  },
});

// ── Songs admin mutations ─────────────────────────────────────────────────────

/**
 * adminMutationLimiter — songs POST / PATCH / DELETE.
 * 20 requests per 15 minutes per IP.
 * Previously defined inline in server/src/routes/songs.routes.js.
 */
const adminMutationLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max:      20,
  message:  {
    success: false,
    error: { message: 'Admin mutation rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
  },
});

/**
 * duplicateCheckLimiter — songs duplicate-check endpoint.
 * 30 requests per 15 minutes per IP.
 * Previously defined inline in server/src/routes/songs.routes.js.
 */
const duplicateCheckLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max:      30,
  message:  {
    success: false,
    error: { message: 'Duplicate check rate limit exceeded', code: 'RATE_LIMIT_EXCEEDED' },
  },
});

// ── Public read domains ───────────────────────────────────────────────────────

/**
 * artistsLimiter — all /api/artists routes.
 * 100 requests per 15 minutes per IP.
 * Previously defined inline in server/src/routes/artists.routes.js.
 * Independent counter from albumsLimiter (see SECURITY NOTE above).
 */
const artistsLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  {
    success: false,
    error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
  },
});

/**
 * albumsLimiter — all /api/albums routes.
 * 100 requests per 15 minutes per IP.
 * Previously defined inline in server/src/routes/albums.routes.js.
 * Independent counter from artistsLimiter (see SECURITY NOTE above).
 */
const albumsLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max:      100,
  message:  {
    success: false,
    error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
  },
});

/**
 * playlistsLimiter — GET /api/playlists/admin (public listing only).
 * 60 requests per 1 minute per IP.
 * Previously defined inline in server/src/routes/playlists.routes.js.
 */
const playlistsLimiter = rateLimit({
  ...base,
  windowMs: 1 * 60 * 1000,
  max:      60,
  message:  {
    success: false,
    error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
  },
});

// ── Error reporting ───────────────────────────────────────────────────────────

/**
 * errorReportLimiter — POST /api/errors/report.
 * 20 requests per 1 minute per IP.
 *
 * Raised from 10 → 20 as part of BUG-017 fix. The client now flushes at
 * most ~8.5 times/min (FLUSH_INTERVAL_MS = 7 000 ms). 20/min gives a 2x
 * margin above the normal flush rate, absorbing visibilitychange flushes
 * and multiple tabs sharing a NAT IP without triggering the limiter.
 *
 * The client-side 429 circuit breaker (opens immediately on first 429
 * response, not after 5 failures) is the primary throttle mechanism.
 * This limiter remains as the server-side safety net against clients that
 * do not respect the 429 signal.
 */
const errorReportLimiter = rateLimit({
  ...base,
  windowMs: 1 * 60 * 1000,
  max:      20,
  message:  {
    success: false,
    error: { message: 'Too many error reports', code: 'RATE_LIMIT_EXCEEDED' },
  },
});

// ── Exports ───────────────────────────────────────────────────────────────────

/**
 * suggestionsLimiter — POST /api/suggestions.
 * 5 requests per 15 minutes per IP.
 * The Firestore 24-hour per-user check is the primary guard;
 * this IP-level limiter blocks burst abuse before Firestore is hit.
 */
const suggestionsLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000,
  max:      5,
  handler: (req, res) => {
  activity.rate_limit_triggered(req, { limiter: 'generalLimiter', path: req.path });
  res.status(429).json({ success: false, error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' } });
},
});

const playsLimiter = rateLimit({
  ...base,
  windowMs: 1 * 60 * 1000,
  max:      60,
  keyGenerator: (req) => req.user?.uid || req.ip,
  validate: { xForwardedForHeader: false, keyGeneratorIpFallback: false },
  message: {
    success: false,
    error: { message: 'Too many play events', code: 'RATE_LIMIT_EXCEEDED' },
  },
});

module.exports = {
  generalLimiter,
  uploadLimiter,
  zipUploadLimiter,
  searchLimiter,
  adminMutationLimiter,
  duplicateCheckLimiter,
  artistsLimiter,
  albumsLimiter,
  playlistsLimiter,
  errorReportLimiter,
  suggestionsLimiter,
  playsLimiter,
};