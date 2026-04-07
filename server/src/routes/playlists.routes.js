const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const isAdmin = require('../middleware/isAdmin');
const upload = require('../middleware/upload');
const ctrl = require('../controllers/playlists.controller');
const { validateCreatePlaylist } = require('../validators/playlist.validator');

router.use(verifyToken, isAdmin);

router.post(
  '/upload-song',
  upload.fields([{ name: 'song', maxCount: 1 }, { name: 'cover', maxCount: 1 }]),
  // note: no validation here since it processes raw songs
  ctrl.uploadPlaylistSong
);

router.post(
  '/with-cover',
  upload.fields([{ name: 'cover', maxCount: 1 }]),
  // removed body validator since it intercepts FormData
  ctrl.createAdminPlaylistWithCover
);

router.post('/', validateCreatePlaylist, ctrl.createAdminPlaylist);
router.get('/', ctrl.getAdminPlaylists);
router.delete('/:id', ctrl.deleteAdminPlaylist);

module.exports = router;
