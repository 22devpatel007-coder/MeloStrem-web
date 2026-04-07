/**
 * server/src/routes/songs.routes.js
 *
 * Public routes   — no auth required (read-only, rate-limited globally by generalLimiter).
 * Protected routes — verifyToken (standard, checkRevoked: false) for regular users.
 * Admin routes    — verifyTokenStrict (checkRevoked: true) + isAdmin for all mutations.
 *
 * Why verifyTokenStrict on admin routes:
 *   If an admin account is compromised or an admin is removed, their token must
 *   be rejected immediately — not after the 60-minute natural expiry window.
 *   verifyTokenStrict adds ~50–100 ms per admin request, which is acceptable.
 *
 * Rate limiters:
 *   adminMutationLimiter  — POST / PATCH / DELETE (upload, update, delete operations)
 *   duplicateCheckLimiter — POST /check-duplicate
 *   Public GET routes inherit the global generalLimiter from server/src/index.js.
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const router = express.Router();

const { verifyToken, verifyTokenStrict } = require('../middleware/verifyToken');
const isAdmin = require('../middleware/isAdmin');
const upload = require('../middleware/upload');
const songsController = require('../controllers/songs.controller');
const { validateCreateSong, validateUpdateSong } = require('../validators/song.validator');

// ─── Rate limiters ────────────────────────────────────────────────────────────

// Applied to all admin mutation endpoints (upload, update, delete).
// 20 mutations per 15 minutes per IP — prevents bulk abuse while allowing
// legitimate bulk-upload workflows through the admin UI.
const adminMutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many requests, please try again later.',
      code: 'RATE_LIMIT',
    },
  },
});

// Applied to duplicate-check endpoint specifically.
// Higher cap (30) because the admin upload UI calls this on every file
// before committing an upload.
const duplicateCheckLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      message: 'Too many duplicate-check requests, please try again later.',
      code: 'RATE_LIMIT',
    },
  },
});
// POST /songs/batch — must be before /:id so Express doesn't treat 'batch' as an ID
router.post('/batch', songsController.getSongsBatch);
// ─── Public routes ────────────────────────────────────────────────────────────
// No auth required. Rate-limited by the global generalLimiter in index.js.

router.get('/', songsController.getAllSongs);
router.get('/:id', songsController.getSongById);

// ─── Admin routes ─────────────────────────────────────────────────────────────
// Middleware order per CLAUDE.md:
//   verifyTokenStrict → isAdmin → upload (if needed) → validator (if needed) → controller

// Duplicate check — called before upload to avoid writing duplicates to Cloudinary.
router.post(
  '/check-duplicate',
  duplicateCheckLimiter,
  verifyTokenStrict,
  isAdmin,
  songsController.checkDuplicate
);

// Upload new song — audio + optional cover image.
router.post(
  '/',
  adminMutationLimiter,
  verifyTokenStrict,
  isAdmin,
  upload.fields([
    { name: 'song', maxCount: 1 },
    { name: 'cover', maxCount: 1 },
  ]),
  validateCreateSong,
  songsController.uploadSong
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
  songsController.updateSong
);

// Delete a song and its Cloudinary assets.
router.delete(
  '/:id',
  adminMutationLimiter,
  verifyTokenStrict,
  isAdmin,
  songsController.deleteSong
);


module.exports = router;