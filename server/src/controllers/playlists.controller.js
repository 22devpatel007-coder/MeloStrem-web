/**
 * server/src/controllers/playlists.controller.js
 *
 * PERMANENT FIX — getUserPlaylists was silently returning empty array.
 * See original file comment for full root-cause analysis. That fix is preserved.
 *
 * PHASE 1 — TASK 1.1 changes:
 *   - All inline res.status(4xx/5xx).json() error calls replaced with AppError throws.
 *   - sendError() calls replaced with next(new AppErrorSubclass()).
 *   - sendSuccess() calls preserved exactly where they were.
 *   - All business logic, Firestore queries, Cloudinary calls, serializeDoc,
 *     retryFirestore usage: completely untouched.
 */

'use strict';

const { deletePlaylist, createPlaylist }               = require('../services/firebase.service');
const { checkDuplicateSong }                           = require('../utils/duplicateCheck');
const { uploadAudio, uploadCover, deleteAsset }        = require('../services/cloudinary.service');
const { createSong }                                   = require('../services/firebase.service');
const { sendSuccess }                                  = require('../utils/apiResponse');
const { retryFirestore }                               = require('../utils/retryFirestore');
const logger                                           = require('../utils/logger');
const { db }                                           = require('../config/firebase');
const { ValidationError, ForbiddenError, NotFoundError, InternalError } = require('../errors');

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
exports.getPublicAdminPlaylists = async (req, res, next) => {
  try {
    const snap = await retryFirestore(
      () => db
        .collection('playlists')
        .where('isAdmin',  '==', true)
        .where('isPublic', '==', true)
        .orderBy('createdAt', 'desc')
        .get(),
      { label: 'getPublicAdminPlaylists' },
    );
    return sendSuccess(res, serializeSnap(snap));
  } catch (err) {
    logger.error('getPublicAdminPlaylists error:', { error: err.message, code: err.code });
    return next(new InternalError('Could not load library playlists. Please try again.', 'PLAYLISTS_FETCH_ERROR', { originalError: err.message }));
  }
};

// ── GET /api/users/:uid/playlists (protected, verifyToken) ───────────────────
//
// FIXED: Removed .where('isAdmin', '==', false) from the Firestore query.
// See full explanation in original file header comment.
exports.getUserPlaylists = async (req, res, next) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return next(new ForbiddenError('Forbidden', 'FORBIDDEN'));
  }

  try {
    const snap = await retryFirestore(
      () => db
        .collection('playlists')
        .where('ownerId', '==', uid)
        .orderBy('createdAt', 'desc')
        .get(),
      { label: 'getUserPlaylists' },
    );

    // Filter out admin-owned playlists in application code.
    // isAdmin:true  → admin library playlist, not shown in user sidebar.
    // isAdmin:false → user playlist.
    // isAdmin:undefined/missing → created by older code path; treat as user playlist.
    const playlists = snap.docs
      .filter((d) => d.data().isAdmin !== true)
      .map((d) => serializeDoc(d.id, d.data()));

    return sendSuccess(res, playlists);
  } catch (err) {
    logger.error('getUserPlaylists error:', { uid, error: err.message, code: err.code });
    return next(new InternalError('Could not load your playlists. Please try again.', 'USER_PLAYLISTS_FETCH_ERROR', { originalError: err.message }));
  }
};

// ── POST /api/playlists/admin/upload-song ─────────────────────────────────────
exports.uploadPlaylistSong = async (req, res, next) => {
  try {
    const { title, artist, genre, duration } = req.body;

    if (!title || !artist || !genre) {
      throw new ValidationError('title, artist and genre are required', 'VALIDATION_ERROR');
    }

    const existing = await checkDuplicateSong(title, artist);
    if (existing) {
      return res.json({
        status:   'duplicate',
        songId:   existing.id,
        existing: { id: existing.id, title: existing.title, artist: existing.artist, createdAt: existing.createdAt },
      });
    }

    if (!req.files?.['song']?.[0])  throw new ValidationError('No song file received',  'MISSING_FILE');
    if (!req.files?.['cover']?.[0]) throw new ValidationError('No cover file received', 'MISSING_FILE');

    const songFile  = req.files['song'][0];
    const coverFile = req.files['cover'][0];

    const [songResult, coverResult] = await Promise.all([
      uploadAudio(songFile.buffer,  { folder: 'melostream/songs',  public_id: `${Date.now()}-${title}` }),
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

    const newSong = await createSong(songData);
    return res.status(201).json({ status: 'uploaded', songId: newSong.id, song: serializeDoc(newSong.id, songData) });
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error('uploadPlaylistSong error:', { error: err.message });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};

// ── POST /api/playlists/admin ─────────────────────────────────────────────────
exports.createAdminPlaylist = async (req, res, next) => {
  try {
    const { name, description, songIds, coverUrl, coverStoragePath } = req.body;

    if (!name || !name.trim()) {
      throw new ValidationError('Playlist name is required', 'VALIDATION_ERROR');
    }

    let parsedSongIds = songIds;
    if (typeof songIds === 'string') {
      try { parsedSongIds = JSON.parse(songIds); } catch { parsedSongIds = []; }
    }
    if (!Array.isArray(parsedSongIds) || parsedSongIds.length === 0) {
      throw new ValidationError('At least one song is required', 'VALIDATION_ERROR');
    }

    const playlistData = {
      name: name.trim(), description: (description || '').trim(),
      ownerId: req.user.uid, ownerEmail: req.user.email,
      songIds: parsedSongIds, coverUrl: coverUrl || '',
      coverStoragePath: coverStoragePath || '', coverType: 'uploaded',
      isPublic: true, isAdmin: true, isFeatured: false,
      createdAt: new Date(), updatedAt: new Date(),
    };

    const newPlaylist = await createPlaylist(playlistData);
    newPlaylist.createdAt = playlistData.createdAt.toISOString();
    newPlaylist.updatedAt = playlistData.updatedAt.toISOString();
    return res.status(201).json(newPlaylist);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error('createAdminPlaylist error:', { error: err.message });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};

// ── POST /api/playlists/admin/with-cover ──────────────────────────────────────
exports.createAdminPlaylistWithCover = async (req, res, next) => {
  try {
    const { name, description, songIds } = req.body;

    if (!name || !name.trim()) {
      throw new ValidationError('Playlist name is required', 'VALIDATION_ERROR');
    }

    let parsedSongIds = songIds;
    if (typeof songIds === 'string') {
      try { parsedSongIds = JSON.parse(songIds); } catch { parsedSongIds = []; }
    }
    if (!Array.isArray(parsedSongIds) || parsedSongIds.length === 0) {
      throw new ValidationError('At least one song is required', 'VALIDATION_ERROR');
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

    const newPlaylist = await createPlaylist(playlistData);
    newPlaylist.createdAt = playlistData.createdAt.toISOString();
    newPlaylist.updatedAt = playlistData.updatedAt.toISOString();
    return res.status(201).json(newPlaylist);
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error('createAdminPlaylistWithCover error:', { error: err.message });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};

// ── GET /api/playlists/admin/all (protected, admin-only) ─────────────────────
exports.getAdminPlaylists = async (req, res, next) => {
  try {
    const snap = await retryFirestore(
      () => db.collection('playlists').where('isAdmin', '==', true).orderBy('createdAt', 'desc').get(),
      { label: 'getAdminPlaylists' },
    );
    return res.json(serializeSnap(snap));
  } catch (err) {
    logger.error('getAdminPlaylists error:', { error: err.message });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};

// ── DELETE /api/playlists/admin/:id ──────────────────────────────────────────
exports.deleteAdminPlaylist = async (req, res, next) => {
  try {
    const docSnap = await retryFirestore(
      () => db.collection('playlists').doc(req.params.id).get(),
      { label: 'deleteAdminPlaylist:get' },
    );

    if (!docSnap.exists) {
      throw new NotFoundError('Playlist not found', 'NOT_FOUND');
    }
    if (!docSnap.data().isAdmin) {
      throw new ForbiddenError('Not an admin playlist', 'FORBIDDEN');
    }

    const { coverStoragePath } = docSnap.data();
    if (coverStoragePath) await deleteAsset(coverStoragePath, { resource_type: 'image' });

    await deletePlaylist(req.params.id);
    return res.json({ message: 'Playlist deleted successfully' });
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error('deleteAdminPlaylist error:', { error: err.message });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};