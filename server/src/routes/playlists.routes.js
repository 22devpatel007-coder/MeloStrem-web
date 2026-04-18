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
 *     GET  /                → verifyToken + isAdmin           (read, non-destructive — non-strict acceptable)
 *     POST /upload-song     → verifyTokenStrict + isAdmin     (mutation — strict required)
 *     POST /with-cover      → verifyTokenStrict + isAdmin     (mutation — strict required)
 *     POST /                → verifyTokenStrict + isAdmin     (mutation — strict required)
 *     DELETE /:id           → verifyTokenStrict + isAdmin     (destructive — strict required)
 *
 *   Why GET / stays on verifyToken (non-strict):
 *     GET /api/playlists (admin list) is a read-only operation. No data is
 *     mutated. The risk of a stale-but-not-yet-revoked token reading the
 *     admin playlist list is low and does not justify the extra ~50-100ms
 *     latency of a revocation check on every admin panel page load.
 *     This mirrors the same reasoning used for public song reads.
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

const { playlistsLimiter } = require('../middleware/rateLimiter');

// ─── Public route ─────────────────────────────────────────────────────────────
// Must be declared BEFORE any auth middleware to remain publicly accessible.
// GET /api/playlists/admin
router.get('/admin', playlistsLimiter, ctrl.getPublicAdminPlaylists);

// ─── Admin read route ─────────────────────────────────────────────────────────
// Read-only — verifyToken (non-strict) is acceptable here.
// A stale-but-unrevoked token reading the playlist list poses minimal risk.
// Middleware order: verifyToken → isAdmin → controller
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
  verifyTokenStrict,
  isAdmin,
  upload.fields([{ name: 'song', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
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