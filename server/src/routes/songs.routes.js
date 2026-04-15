/**
 * server/src/routes/songs.routes.js
 *
 * Phase 3 — Task 3.2 / 3.3: Rate limiter fix on POST /batch.
 *
 * Change from previous version:
 *   BUGFIX: POST /songs/batch was incorrectly wrapped in adminMutationLimiter
 *   (20 req/15min). This route is a READ operation used by PlaylistDetail to
 *   resolve playlist songs — it requires no auth and is called on every
 *   playlist page load. Applying adminMutationLimiter meant legitimate users
 *   could hit the 20-request cap just by browsing playlists.
 *
 *   Fix: removed adminMutationLimiter from POST /batch. The global
 *   generalLimiter (100 req/15min) applied in server/src/index.js is the
 *   correct protection for this public read endpoint.
 *
 * Everything else is IDENTICAL to the previous version:
 *   - All other route definitions, middleware chains: untouched.
 *   - verifyTokenStrict + isAdmin on all mutation routes: untouched.
 *   - adminMutationLimiter still applied to POST /, PATCH /:id, DELETE /:id.
 *   - duplicateCheckLimiter on POST /check-duplicate: untouched.
 *   - Validator middleware order: untouched.
 */

const express = require('express');
const router  = express.Router();

const { verifyTokenStrict } = require('../middleware/verifyToken');
const isAdmin          = require('../middleware/isAdmin');
const upload           = require('../middleware/upload');
const songsController  = require('../controllers/songs.controller');
const { validateCreateSong, validateUpdateSong } = require('../validators/song.validator');
const { adminMutationLimiter, duplicateCheckLimiter } = require('../middleware/rateLimiter');

// ── POST /songs/batch ─────────────────────────────────────────────────────────
// Public read — no auth, no mutation limiter.
// Covered by global generalLimiter (100 req/15min) in server/src/index.js.
// Must be declared before /:id so Express does not treat 'batch' as an ID param.
router.post('/batch', songsController.getSongsBatch);

// ── Public routes ─────────────────────────────────────────────────────────────
// No auth required. Rate-limited by the global generalLimiter in index.js.
router.get('/',    songsController.getAllSongs);
router.get('/:id', songsController.getSongById);

// ── Admin routes ──────────────────────────────────────────────────────────────
// Middleware order per CLAUDE.md:
//   limiter → verifyTokenStrict → isAdmin → upload (if needed) → validator (if needed) → controller

// Duplicate check — lightweight Firestore read before upload.
router.post(
  '/check-duplicate',
  duplicateCheckLimiter,
  verifyTokenStrict,
  isAdmin,
  songsController.checkDuplicate,
);

// Upload new song — audio + optional cover image.
router.post(
  '/',
  adminMutationLimiter,
  verifyTokenStrict,
  isAdmin,
  upload.fields([
    { name: 'song',  maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  validateCreateSong,
  songsController.uploadSong,
);

// Update song metadata or cover image.
router.patch(
  '/:id',
  adminMutationLimiter,
  verifyTokenStrict,
  isAdmin,
  upload.fields([
    { name: 'cover', maxCount: 1 },
  ]),
  validateUpdateSong,
  songsController.updateSong,
);

// Delete a song and its Cloudinary assets.
router.delete(
  '/:id',
  adminMutationLimiter,
  verifyTokenStrict,
  isAdmin,
  songsController.deleteSong,
);

module.exports = router;