/**
 * server/src/controllers/playlists.controller.js
 *
 * PERMANENT FIX — ECONNRESET / socket hang up on getPublicAdminPlaylists
 *                 and all inline db.* calls
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Root cause:
 *   getPublicAdminPlaylists, getAdminPlaylists, deleteAdminPlaylist, and
 *   getUserPlaylists all made direct unguarded db.collection(...).get() calls.
 *   Under Render's idle socket drop conditions, these threw ECONNRESET with
 *   no retry, surfacing as 500s visible in the error log.
 *
 * Fix:
 *   All inline db.* calls are now wrapped in retryFirestore().
 *   Service-layer calls (createPlaylist, deletePlaylist) are already retried
 *   inside firebase.service.js, so no double-wrapping is needed there.
 *
 * No changes to response shapes, route contracts, or middleware chains.
 */

'use strict';

const { deletePlaylist, createPlaylist } = require('../services/firebase.service');
const { checkDuplicateSong }             = require('../utils/duplicateCheck');
const { uploadAudio, uploadCover, deleteAsset } = require('../services/cloudinary.service');
const { createSong }                     = require('../services/firebase.service');
const { sendSuccess, sendError }         = require('../utils/apiResponse');
const { retryFirestore }                 = require('../utils/retryFirestore');
const logger                             = require('../utils/logger');
const { db }                             = require('../config/firebase');

// ── Helpers ───────────────────────────────────────────────────────────────────
function serializeDoc(id, data) {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
  };
}

function serializeSnap(snap) {
  return snap.docs.map((d) => serializeDoc(d.id, d.data()));
}

// ── GET /api/playlists/admin (public, no auth) ────────────────────────────────
exports.getPublicAdminPlaylists = async (req, res) => {
  try {
    // FIX: wrapped in retryFirestore — was failing with ECONNRESET after idle
    const snap = await retryFirestore(
      () => db
        .collection('playlists')
        .where('isAdmin',  '==', true)
        .where('isPublic', '==', true)
        .orderBy('createdAt', 'desc')
        .get(),
      { label: 'getPublicAdminPlaylists' }
    );
    return sendSuccess(res, serializeSnap(snap));
  } catch (err) {
    logger.error('getPublicAdminPlaylists error:', { error: err.message, code: err.code });
    return sendError(res, 'Could not load library playlists. Please try again.', 500, 'PLAYLISTS_FETCH_ERROR');
  }
};

// ── GET /api/users/:uid/playlists (protected, verifyToken) ───────────────────
exports.getUserPlaylists = async (req, res) => {
  try {
    const { uid } = req.params;
    if (req.user.uid !== uid) {
      return sendError(res, 'Forbidden', 403, 'FORBIDDEN');
    }
    // FIX: wrapped in retryFirestore
    const snap = await retryFirestore(
      () => db
        .collection('playlists')
        .where('ownerId', '==', uid)
        .where('isAdmin', '==', false)
        .orderBy('createdAt', 'desc')
        .get(),
      { label: 'getUserPlaylists' }
    );
    return sendSuccess(res, serializeSnap(snap));
  } catch (err) {
    logger.error('getUserPlaylists error:', { uid: req.params.uid, error: err.message });
    return sendError(res, 'Could not load your playlists. Please try again.', 500, 'USER_PLAYLISTS_FETCH_ERROR');
  }
};

// ── POST /api/playlists/admin/upload-song ─────────────────────────────────────
exports.uploadPlaylistSong = async (req, res) => {
  try {
    const { title, artist, genre, duration } = req.body;
    if (!title || !artist || !genre) {
      return res.status(400).json({ error: 'title, artist and genre are required' });
    }
    const existing = await checkDuplicateSong(title, artist); // already retried in service
    if (existing) {
      return res.json({
        status: 'duplicate',
        songId: existing.id,
        existing: { id: existing.id, title: existing.title, artist: existing.artist, createdAt: existing.createdAt },
      });
    }
    if (!req.files?.['song']?.[0])  return res.status(400).json({ error: 'No song file received' });
    if (!req.files?.['cover']?.[0]) return res.status(400).json({ error: 'No cover file received' });

    const songFile  = req.files['song'][0];
    const coverFile = req.files['cover'][0];

    const [songResult, coverResult] = await Promise.all([
      uploadAudio(songFile.buffer, { folder: 'melostream/songs',  public_id: `${Date.now()}-${title}` }),
      uploadCover(coverFile.buffer, { folder: 'melostream/covers', public_id: `${Date.now()}-${title}-cover` }),
    ]);

    const songData = {
      title, artist, genre,
      titleLower:       title.toLowerCase(),
      artistLower:      artist.toLowerCase(),
      duration:         Number(duration) || 0,
      fileUrl:          songResult.secure_url,
      coverUrl:         coverResult.secure_url,
      storagePath:      songResult.public_id,
      coverStoragePath: coverResult.public_id,
      playCount:        0,
      featured:         false,
      uploadedBy:       req.user.uid,
      createdAt:        new Date(),
      updatedAt:        new Date(),
    };

    const newSong = await createSong(songData); // retried inside firebase.service
    res.status(201).json({ status: 'uploaded', songId: newSong.id, song: serializeDoc(newSong.id, songData) });
  } catch (err) {
    logger.error('uploadPlaylistSong error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// ── POST /api/playlists/admin ─────────────────────────────────────────────────
exports.createAdminPlaylist = async (req, res) => {
  try {
    const { name, description, songIds, coverUrl, coverStoragePath } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Playlist name is required' });

    let parsedSongIds = songIds;
    if (typeof songIds === 'string') { try { parsedSongIds = JSON.parse(songIds); } catch { parsedSongIds = []; } }
    if (!Array.isArray(parsedSongIds) || parsedSongIds.length === 0) {
      return res.status(400).json({ error: 'At least one song is required' });
    }

    const playlistData = {
      name: name.trim(), description: (description || '').trim(),
      ownerId: req.user.uid, ownerEmail: req.user.email,
      songIds: parsedSongIds, coverUrl: coverUrl || '',
      coverStoragePath: coverStoragePath || '', coverType: 'uploaded',
      isPublic: true, isAdmin: true, isFeatured: false,
      createdAt: new Date(), updatedAt: new Date(),
    };

    const newPlaylist = await createPlaylist(playlistData); // retried inside firebase.service
    newPlaylist.createdAt = playlistData.createdAt.toISOString();
    newPlaylist.updatedAt = playlistData.updatedAt.toISOString();
    res.status(201).json(newPlaylist);
  } catch (err) {
    logger.error('createAdminPlaylist error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// ── POST /api/playlists/admin/with-cover ──────────────────────────────────────
exports.createAdminPlaylistWithCover = async (req, res) => {
  try {
    const { name, description, songIds } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Playlist name is required' });

    let parsedSongIds = songIds;
    if (typeof songIds === 'string') { try { parsedSongIds = JSON.parse(songIds); } catch { parsedSongIds = []; } }
    if (!Array.isArray(parsedSongIds) || parsedSongIds.length === 0) {
      return res.status(400).json({ error: 'At least one song is required' });
    }

    let coverUrl = '', coverStoragePath = '';
    const coverFile = req.files?.['cover']?.[0];
    if (coverFile) {
      const coverResult = await uploadCover(coverFile.buffer, {
        folder:    'melostream/playlist-covers',
        public_id: `${Date.now()}-${name.trim()}-playlist-cover`,
      });
      coverUrl         = coverResult.secure_url;
      coverStoragePath = coverResult.public_id;
    }

    const playlistData = {
      name: name.trim(), description: (description || '').trim(),
      ownerId: req.user.uid, ownerEmail: req.user.email,
      songIds: parsedSongIds, coverUrl, coverStoragePath,
      coverType: 'uploaded', isPublic: true, isAdmin: true, isFeatured: false,
      createdAt: new Date(), updatedAt: new Date(),
    };

    const newPlaylist = await createPlaylist(playlistData); // retried inside firebase.service
    newPlaylist.createdAt = playlistData.createdAt.toISOString();
    newPlaylist.updatedAt = playlistData.updatedAt.toISOString();
    res.status(201).json(newPlaylist);
  } catch (err) {
    logger.error('createAdminPlaylistWithCover error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// ── GET /api/playlists/admin/all (protected, admin-only) ─────────────────────
exports.getAdminPlaylists = async (req, res) => {
  try {
    // FIX: wrapped in retryFirestore
    const snap = await retryFirestore(
      () => db.collection('playlists').where('isAdmin', '==', true).orderBy('createdAt', 'desc').get(),
      { label: 'getAdminPlaylists' }
    );
    res.json(serializeSnap(snap));
  } catch (err) {
    logger.error('getAdminPlaylists error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

// ── DELETE /api/playlists/admin/:id ──────────────────────────────────────────
exports.deleteAdminPlaylist = async (req, res) => {
  try {
    // FIX: wrapped in retryFirestore
    const docSnap = await retryFirestore(
      () => db.collection('playlists').doc(req.params.id).get(),
      { label: 'deleteAdminPlaylist:get' }
    );

    if (!docSnap.exists) return res.status(404).json({ error: 'Playlist not found' });
    if (!docSnap.data().isAdmin) return res.status(403).json({ error: 'Not an admin playlist' });

    const { coverStoragePath } = docSnap.data();
    if (coverStoragePath) await deleteAsset(coverStoragePath, { resource_type: 'image' });

    await deletePlaylist(req.params.id); // retried inside firebase.service
    res.json({ message: 'Playlist deleted successfully' });
  } catch (err) {
    logger.error('deleteAdminPlaylist error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};