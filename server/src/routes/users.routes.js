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