const express = require('express');
const router = express.Router();

const authRoutes     = require('./auth.routes');
const songsRoutes    = require('./songs.routes');
const searchRoutes   = require('./search.routes');
const playlistsRoutes = require('./playlists.routes');
const usersRoutes    = require('./users.routes');
const artistsRoutes  = require('./artists.routes');
const albumsRoutes   = require('./albums.routes');

router.use('/auth',      authRoutes);
router.use('/songs',     songsRoutes);
router.use('/search',    searchRoutes);
router.use('/playlists', playlistsRoutes);
router.use('/users',     usersRoutes);
router.use('/artists',   artistsRoutes);
router.use('/albums',    albumsRoutes);

module.exports = router;