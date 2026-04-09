const express = require('express');
const router = express.Router();

const authRoutes      = require('./auth.routes');
const songsRoutes     = require('./songs.routes');
const searchRoutes    = require('./search.routes');
const playlistsRoutes = require('./playlists.routes');
const usersRoutes     = require('./users.routes');
const artistsRoutes   = require('./artists.routes');
const albumsRoutes    = require('./albums.routes');

// ✅ Health check — used for keep-alive self-ping and uptime monitors
router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
  });
});

router.use('/auth',      authRoutes);
router.use('/songs',     songsRoutes);
router.use('/search',    searchRoutes);
router.use('/playlists', playlistsRoutes);
router.use('/users',     usersRoutes);
router.use('/artists',   artistsRoutes);
router.use('/albums',    albumsRoutes);

module.exports = router;