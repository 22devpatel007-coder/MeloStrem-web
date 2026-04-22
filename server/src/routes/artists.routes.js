/**
 * server/src/routes/artists.routes.js
 *
 * Phase 3 — Task 3.2: Rate limiter consolidated to named export from rateLimiter.js.
 *
 * Fix from previous version:
 *   BUGFIX: `artistLimiter` → `artistsLimiter` (typo in destructure caused
 *   runtime crash — undefined middleware passed to router.get()).
 *
 * Everything else is IDENTICAL to the previous version:
 *   - Route paths, controller references: untouched.
 *   - Middleware order (limiter → controller): untouched.
 *
 * Contracts:
 *   GET /api/artists/:id         → Artist | 404
 *   GET /api/artists/:id/songs   → { songs, nextCursor, hasMore }
 */

const express = require('express');
const router  = express.Router();

const artistsController = require('../controllers/artists.controller');
const { artistsLimiter } = require('../middleware/rateLimiter'); // ← was `artistLimiter` (typo)

// GET /api/artists/:id — Artist document
router.get('/:id',       artistsLimiter, artistsController.getArtist);

// GET /api/artists/:id/songs — paginated songs by this artist
router.get('/:id/songs', artistsLimiter, artistsController.getArtistSongs);

module.exports = router;