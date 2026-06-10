/**
 * server/src/routes/playlists.routes.js
 *
 * Phase 3 — Task 3.6: Migrate playlist mutation routes to verifyTokenStrict.
 *
 * Change from previous version:
 *   SECURITY: All playlist mutation routes (POST, DELETE) previously used
 *   verifyToken (checkRevoked=false) via a blanket router.use(verifyToken, isAdmin).
 *   This meant a revoked admin token remained valid for up to ~60 minutes —
 *   the same security gap that songs routes had before Phase 2.
 *
 *   Fix: Replaced the blanket router.use(verifyToken, isAdmin) with per-route
 *   middleware chains, matching the pattern established in songs.routes.js.
 *
 *   Middleware assignment after this change:
 *     GET  /admin           → playlistsLimiter only          (public, read-only — intentional)
 *     GET  /                → verifyTokenStrict + isAdmin     (read, non-destructive — strict required)
 *     POST /upload-song     → verifyTokenStrict + isAdmin     (mutation — strict required)
 *     POST /with-cover      → verifyTokenStrict + isAdmin     (mutation — strict required)
 *     POST /                → verifyTokenStrict + isAdmin     (mutation — strict required)
 *     DELETE /:id           → verifyTokenStrict + isAdmin     (destructive — strict required)
 *
 *   Note: GET /api/playlists now executes `verifyTokenStrict + isAdmin`.
 *   The read remains low-risk but a strict revocation check is applied
 *   to align with songs admin read/mutation patterns and reduce exposure
 *   from recently-revoked admin tokens.
 *
 *   Everything else is IDENTICAL to the previous version:
 *     - playlistsLimiter definition and GET /admin public route: untouched.
 *     - All controller references: untouched.
 *     - upload middleware usage: untouched.
 *     - validateCreatePlaylist validator: untouched.
 *     - isAdmin middleware: untouched.
 */

const express   = require('express');
const router    = express.Router();

const { verifyToken, verifyTokenStrict } = require('../middleware/verifyToken');
const isAdmin              = require('../middleware/isAdmin');
const upload               = require('../middleware/upload');
const ctrl                 = require('../controllers/playlists.controller');
const { validateCreatePlaylist } = require('../validators/playlist.validator');
const { validateCreateSong }     = require('../validators/song.validator');

const { playlistsLimiter, zipUploadLimiter } = require('../middleware/rateLimiter');

// ─── Public route ─────────────────────────────────────────────────────────────
// Must be declared BEFORE any auth middleware to remain publicly accessible.
// GET /api/playlists/admin
router.get('/admin', playlistsLimiter, ctrl.getPublicAdminPlaylists);

// ─── Admin read route ─────────────────────────────────────────────────────────
// Read-only — verifyTokenStrict is applied to align with admin mutation routes.
// Middleware order: verifyTokenStrict → isAdmin → controller
router.get('/', verifyTokenStrict, isAdmin, ctrl.getAdminPlaylists);

// ─── Admin mutation routes ────────────────────────────────────────────────────
// All routes below mutate or delete data.
// Middleware order per CLAUDE.md + songs.routes.js reference pattern:
//   verifyTokenStrict → isAdmin → upload (if needed) → validator (if needed) → controller
//
// verifyTokenStrict (checkRevoked=true) ensures a revoked admin token is
// rejected immediately (~seconds), not after the ~60-minute expiry window.

// Upload a song directly into a playlist.
router.post(
  '/upload-song',
  zipUploadLimiter,
  verifyTokenStrict,
  isAdmin,
  upload.fields([{ name: 'song', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  validateCreateSong,
  ctrl.uploadPlaylistSong,
);

// Create a playlist with a cover image.
router.post(
  '/with-cover',
  verifyTokenStrict,
  isAdmin,
  upload.fields([{ name: 'cover', maxCount: 1 }]),
  ctrl.createAdminPlaylistWithCover,
);

// Create a playlist (metadata only, no file upload).
router.post(
  '/',
  verifyTokenStrict,
  isAdmin,
  validateCreatePlaylist,
  ctrl.createAdminPlaylist,
);

// Delete a playlist by ID.
router.delete(
  '/:id',
  verifyTokenStrict,
  isAdmin,
  ctrl.deleteAdminPlaylist,
);

module.exports = router;