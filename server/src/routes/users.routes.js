/**
 * server/src/routes/users.routes.js
 *
 * ADDED: POST /users/:uid/session-picks
 *   Receives batched pick events for co-occurrence data collection.
 *   Middleware: verifyToken → controller ownership check (same pattern as liked-songs).
 *   No isAdmin needed — users log their own picks.
 *
 * All existing routes unchanged.
 */

const express        = require('express');
const router         = express.Router();
const verifyToken    = require('../middleware/verifyToken');
const isAdmin        = require('../middleware/isAdmin');
const usersController = require('../controllers/users.controller');

// ── Admin: list all users ─────────────────────────────────────────────────────
router.get('/', verifyToken, isAdmin, usersController.getAllUsers);

// ── User: liked songs ─────────────────────────────────────────────────────────
router.get(
  '/:uid/liked-songs',
  verifyToken,
  usersController.getLikedSongs,
);

router.post(
  '/:uid/liked-songs/:songId',
  verifyToken,
  usersController.toggleLikedSong,
);

// ── User: session picks (co-occurrence data collection) ───────────────────────
// POST /users/:uid/session-picks
// Body: { picks: Array<{ songId, previousSongId, contextType, contextId, ts }> }
// Fire-and-forget from client — always 200 on valid auth + payload.
router.post(
  '/:uid/session-picks',
  verifyToken,
  usersController.logSessionPicks,
);

module.exports = router;