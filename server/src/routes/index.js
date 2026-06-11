/**
 * server/src/routes/index.js
 *
 * PHASE 4 — TASK 4.3: Enriched /api/health response.
 *
 * Changes from previous version (ONLY these — nothing else touched):
 *
 *   1. Import package.json version once at module load (same pattern as
 *      server/src/index.js) so /api/health returns a consistent version field.
 *
 *   2. Enrich GET /api/health:
 *        Before:  { status, timestamp, uptime }
 *        After:   { status, timestamp, uptime, version, environment }
 *      Fields match /health exactly so uptime monitors get the same shape
 *      regardless of which path they poll. The two endpoints coexist because:
 *        - /health is used by Render health-check and the keep-alive self-ping.
 *        - /api/health is used by frontend clients that prefix all calls with /api.
 *      Both must return the same shape — a version mismatch between the two
 *      would indicate a misconfiguration, not a real version difference.
 *
 *   Note: /api/health does NOT do dependency probes (Firestore / Cloudinary).
 *   Readiness probes live only at /ready (app root) because:
 *     - Render's health-check config points to the root paths (/health, /ready),
 *       not the /api prefix.
 *     - /api is behind the API router which could in theory have rate limiters
 *       applied. Readiness probes must never be rate-limited.
 *     - Keeping the probe logic in one place (healthChecker.js + /ready handler)
 *       prevents divergence between two implementations of the same check.
 *
 * Everything else is identical to the previous version.
 */

'use strict';

const express = require('express');
const router  = express.Router();

// ── Phase 4 Task 4.3 — version for /api/health ───────────────────────────────
// Read once at require-time. Consistent with the /health handler in index.js.
// Path: this file is server/src/routes/index.js → package.json is two dirs up.
const { version }     = require('../../package.json');
const config          = require('../config/index');

const authRoutes      = require('./auth.routes');
const songsRoutes     = require('./songs.routes');
const searchRoutes    = require('./search.routes');
const playlistsRoutes = require('./playlists.routes');
const usersRoutes     = require('./users.routes');
const artistsRoutes   = require('./artists.routes');
const albumsRoutes    = require('./albums.routes');
const errorsRoutes    = require('./errors.routes');   // Phase 4 Task 4.2
const suggestionsRouter = require('./suggestions.routes');
const playsRouter = require('./Plays.routes');


// ── Health check ──────────────────────────────────────────────────────────────
// Used for keep-alive self-ping and uptime monitors that prefix all paths
// with /api. Synchronous only — no dependency probes (those live at /ready).
//
// Fields match /health in server/src/index.js exactly:
//   status      — always 'ok' (if the process is dead, no response is sent)
//   timestamp   — ISO-8601 UTC request time
//   uptime      — process uptime in seconds
//   version     — from package.json; confirms correct build is deployed
//   environment — NODE_ENV; confirms environment identity
//
// pid is intentionally omitted here (it is present on /health).
// /api/health is a client-facing endpoint; pid is an internal operational
// detail that does not need to be exposed through the API prefix.
router.get('/health', (_req, res) => {
  res.status(200).json({
    status:      'ok',
    timestamp:   new Date().toISOString(),
    uptime:      Math.floor(process.uptime()),
    version,
    environment: config.nodeEnv,
  });
});

// ── Domain routes ─────────────────────────────────────────────────────────────
router.use('/auth',      authRoutes);
router.use('/songs',     songsRoutes);
router.use('/search',    searchRoutes);
router.use('/playlists', playlistsRoutes);
router.use('/suggestions', suggestionsRouter);
router.use('/plays', playsRouter);
router.use('/users',     usersRoutes);
router.use('/artists',   artistsRoutes);
router.use('/albums',    albumsRoutes);
router.use('/errors',    errorsRoutes);   // Phase 4 Task 4.2

module.exports = router;