/**
 * server/src/routes/albums.routes.js
 *
 * Public read-only routes for Album data.
 * No auth required — consistent with /api/songs and /api/search.
 *
 * Rate limiting:
 *   All routes inherit the global generalLimiter from server/src/index.js.
 *   searchLimiter applied per-route for paginated data endpoints.
 *
 * Middleware pattern (per CLAUDE.md — public read routes):
 *   searchLimiter → controller
 *
 * Contracts:
 *   GET /api/albums/:id         → Album | 404
 *   GET /api/albums/:id/songs   → { songs: Song[] }  (ordered by trackNumber asc)
 */

const express = require('express');
const router  = express.Router();
const rateLimit = require('express-rate-limit');
const albumsController = require('../controllers/albums.controller');

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

// GET /api/albums/:id — Album document
router.get('/:id', searchLimiter, albumsController.getAlbum);

// GET /api/albums/:id/songs — all songs in this album, ordered by trackNumber
router.get('/:id/songs', searchLimiter, albumsController.getAlbumSongs);

module.exports = router;