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
router.get('/:uid/recent-plays',         usersCtrl.getRecentPlays);
router.get('/:uid/session',              usersCtrl.getSessionData);
router.patch('/:uid/listen-session',     usersCtrl.updateListenSession);
router.post('/:uid/heartbeat',           usersCtrl.updateActiveStatus);
router.post('/:uid/offline',             usersCtrl.setOfflineStatus);
module.exports = router;