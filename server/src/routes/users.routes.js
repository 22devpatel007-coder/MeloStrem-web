/**
 * server/src/routes/users.routes.js
 *
 * PRODUCTION READY — No changes from previous version.
 *
 * All routes sit behind router.use(verifyToken) — every request must carry
 * a valid Firebase ID token.
 *
 * Route ownership:
 *   GET  /                          → admin only (isAdmin guard)
 *   GET  /:uid/liked-songs          → controller enforces uid === req.user.uid
 *   POST /:uid/liked-songs/:songId  → controller enforces uid === req.user.uid
 *   POST /:uid/session-picks        → controller enforces uid === req.user.uid
 *   GET  /:uid/playlists            → playlistsCtrl.getUserPlaylists
 *                                     (controller enforces uid === req.user.uid)
 */

const express        = require('express');
const router         = express.Router();
const { verifyToken }   = require('../middleware/verifyToken');
const isAdmin        = require('../middleware/isAdmin');
const usersCtrl      = require('../controllers/users.controller');
const playlistsCtrl  = require('../controllers/playlists.controller');

// All routes in this file require a valid Firebase ID token.
router.use(verifyToken);

router.get('/',                          isAdmin, usersCtrl.getAllUsers);
router.get('/:uid/liked-songs',          usersCtrl.getLikedSongs);
router.post('/:uid/liked-songs/:songId', usersCtrl.toggleLikedSong);
router.post('/:uid/session-picks',       usersCtrl.logSessionPicks);
router.get('/:uid/playlists',            playlistsCtrl.getUserPlaylists);

module.exports = router;