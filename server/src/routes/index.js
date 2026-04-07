const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const songsRoutes = require('./songs.routes');
const searchRoutes = require('./search.routes');
const playlistsRoutes = require('./playlists.routes');
const usersRoutes = require('./users.routes');

router.use('/auth', authRoutes);
router.use('/songs', songsRoutes);
router.use('/search', searchRoutes);
router.use('/playlists', playlistsRoutes);
router.use('/users', usersRoutes);

module.exports = router;
