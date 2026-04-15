
const express = require('express');
const router  = express.Router();

const albumsController = require('../controllers/albums.controller');

const { albumsLimiter } = require('../middleware/rateLimiter');

// GET /api/albums/:id — Album document
router.get('/:id', albumsLimiter, albumsController.getAlbum);

// GET /api/albums/:id/songs — all songs in this album, ordered by trackNumber
router.get('/:id/songs', albumsLimiter, albumsController.getAlbumSongs);

module.exports = router;