/**
 * server/src/routes/playlists.routes.js
 *
 * SCALABLE FIX — Public route added BEFORE verifyToken + isAdmin middleware:
 *
 *   GET /api/playlists/admin  → getPublicAdminPlaylists (no auth, rate-limited)
 *
 * All existing admin-protected routes unchanged.
 * GET /api/users/:uid/playlists is in users.routes.js (verifyToken only).
 */

const express     = require('express');
const router      = express.Router();
const rateLimit   = require('express-rate-limit');
const {verifyToken} = require('../middleware/verifyToken');
const isAdmin     = require('../middleware/isAdmin');
const upload      = require('../middleware/upload');
const ctrl        = require('../controllers/playlists.controller');
const { validateCreatePlaylist } = require('../validators/playlist.validator');

// Dedicated limiter for the public admin playlists endpoint.
// Separate from generalLimiter so this doesn't consume the global budget.
const playlistsLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute window
  max:      60,             // 60 req/min per IP
  standardHeaders: true,
  legacyHeaders:   false,
  message: {
    success: false,
    error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' },
  },
});

// PUBLIC — must be declared BEFORE router.use(verifyToken, isAdmin)
// GET /api/playlists/admin
router.get('/admin', playlistsLimiter, ctrl.getPublicAdminPlaylists);

// All routes below require verifyToken + isAdmin
router.use(verifyToken, isAdmin);

router.post(
  '/upload-song',
  upload.fields([{ name: 'song', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  ctrl.uploadPlaylistSong,
);
router.post('/with-cover', upload.fields([{ name: 'cover', maxCount: 1 }]), ctrl.createAdminPlaylistWithCover);
router.post('/',    validateCreatePlaylist, ctrl.createAdminPlaylist);
router.get('/',     ctrl.getAdminPlaylists);
router.delete('/:id', ctrl.deleteAdminPlaylist);

module.exports = router;