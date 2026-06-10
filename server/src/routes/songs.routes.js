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
// Covered by global generalLimiter (500 req/15min) in server/src/index.js.
// Must be declared before /:id so Express does not treat 'batch' as an ID param.
router.post('/batch', songsController.getSongsBatch);
  
router.delete(
  '/bulk-delete',
  adminMutationLimiter,
  verifyTokenStrict,
  isAdmin,
  songsController.bulkDeleteSongs,
);
// ── Public routes ─────────────────────────────────────────────────────────────
// No auth required. Rate-limited by the global generalLimiter in index.js.
// ── Public routes ─────────────────────────────────────────────────────────────
// No auth required. Rate-limited by the global generalLimiter in index.js.
// GET /songs/ids must be declared before /:id so Express does not treat 'ids' as an ID param.
router.get('/ids', songsController.getSongIds);
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