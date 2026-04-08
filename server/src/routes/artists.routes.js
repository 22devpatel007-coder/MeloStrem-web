/**
 * server/src/routes/artists.routes.js
 *
 * Public read-only routes for Artist data.
 * No auth required — consistent with /api/songs and /api/search.
 *
 * Rate limiting:
 *   All routes inherit the global generalLimiter from server/src/index.js.
 *   searchLimiter is applied per-route for paginated data endpoints to match
 *   the pattern used on /api/search and /api/songs.
 *
 * Middleware pattern (per CLAUDE.md — public read routes):
 *   searchLimiter → controller
 *
 * Contracts:
 *   GET /api/artists/:id         → Artist | 404
 *   GET /api/artists/:id/songs   → { songs, nextCursor, hasMore }
 */

const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const artistsController = require('../controllers/artists.controller');

// Reuse the same window/cap as search to keep read-endpoint policy consistent.
const searchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { message: 'Too many requests, please try again later.', code: 'RATE_LIMIT' },
  },
});

// GET /api/artists/:id — Artist document
router.get('/:id', searchLimiter, artistsController.getArtist);

// GET /api/artists/:id/songs — paginated songs by this artist
router.get('/:id/songs', searchLimiter, artistsController.getArtistSongs);

module.exports = router;