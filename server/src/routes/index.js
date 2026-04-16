/**
 * server/src/routes/index.js
 *
 * Central API router. All domain routes are registered here.
 *
 * PHASE 4 — TASK 4.2 addition:
 *   Registered errorsRoutes at /errors.
 *   Full endpoint: POST /api/errors/report
 *   No auth middleware — public endpoint, rate-limited in errors.routes.js.
 */

const express = require('express');
const router  = express.Router();

const authRoutes      = require('./auth.routes');
const songsRoutes     = require('./songs.routes');
const searchRoutes    = require('./search.routes');
const playlistsRoutes = require('./playlists.routes');
const usersRoutes     = require('./users.routes');
const artistsRoutes   = require('./artists.routes');
const albumsRoutes    = require('./albums.routes');
const errorsRoutes    = require('./errors.routes');   // Phase 4 Task 4.2

// ── Health check ──────────────────────────────────────────────────────────────
// Used for keep-alive self-ping and uptime monitors.
// /health is also registered at the app root in server/src/index.js —
// this /api/health duplicate exists for clients that prefix all calls with /api.
router.get('/health', (req, res) => {
  res.status(200).json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
  });
});

// ── Domain routes ─────────────────────────────────────────────────────────────
router.use('/auth',      authRoutes);
router.use('/songs',     songsRoutes);
router.use('/search',    searchRoutes);
router.use('/playlists', playlistsRoutes);
router.use('/users',     usersRoutes);
router.use('/artists',   artistsRoutes);
router.use('/albums',    albumsRoutes);
router.use('/errors',    errorsRoutes);   // Phase 4 Task 4.2

module.exports = router;