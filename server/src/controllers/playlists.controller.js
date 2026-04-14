/**
 * server/src/controllers/playlists.controller.js
 *
 * PERMANENT FIX — getUserPlaylists was silently returning empty array
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * ROOT CAUSE (getUserPlaylists):
 *
 *   BUG 1 — .where('isAdmin', '==', false) is too strict.
 *     Playlists created via Firestore direct writes (usePlaylistMutations)
 *     correctly set isAdmin:false. But playlists created via REST or older
 *     code paths may have isAdmin:undefined or the field missing entirely.
 *     Firestore inequality/equality filters do NOT match documents where the
 *     field is absent — those playlists were silently dropped from results.
 *
 *     FIX: Query only on ownerId. Filter out isAdmin:true in application
 *     code so missing-field documents are included. This is safe because
 *     the ownerId === req.user.uid ownership check is already enforced.
 *
 *   BUG 2 — Composite index requirement.
 *     where('ownerId') + where('isAdmin') + orderBy('createdAt') requires a
 *     composite Firestore index. If that index does not exist the entire
 *     query throws a 9 FAILED_PRECONDITION error, which was caught and
 *     returned as a 500 — surfacing as an empty list in the sidebar.
 *
 *     FIX: Removing the where('isAdmin') clause drops the composite index
 *     requirement. The remaining where('ownerId') + orderBy('createdAt')
 *     only needs a single-field index on createdAt (auto-created by
 *     Firestore) or a simple composite that is far more likely to exist.
 *
 * All other controllers — completely unchanged.
 * No changes to response shapes or route contracts.
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
//
// FIXED: Removed .where('isAdmin', '==', false) from the Firestore query.
//
// Why:
//   1. Playlists with a missing or undefined isAdmin field are never returned
//      by Firestore equality filters — they were silently dropped.
//   2. The two-field where() + orderBy() combination required a composite
//      index that may not exist, causing a FAILED_PRECONDITION 500 error.
//
// The isAdmin:true guard is now applied in JS after the fetch. This is safe
// because the query is already scoped to ownerId === req.user.uid, so a user
// can never see another user's playlists regardless of the isAdmin value.
exports.getUserPlaylists = async (req, res) => {
  const { uid } = req.params;

  if (req.user.uid !== uid) {
    return sendError(res, 'Forbidden', 403, 'FORBIDDEN');
  }

  try {
    // Query only on ownerId — no composite index required.
    // orderBy createdAt desc requires a single-field index (auto-created).
    const snap = await retryFirestore(
      () => db
        .collection('playlists')
        .where('ownerId', '==', uid)
        .orderBy('createdAt', 'desc')
        .get(),
      { label: 'getUserPlaylists' }
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
    const existing = await checkDuplicateSong(title, artist);
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

    const newSong = await createSong(songData);
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

    const newPlaylist = await createPlaylist(playlistData);
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

    const newPlaylist = await createPlaylist(playlistData);
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
    const docSnap = await retryFirestore(
      () => db.collection('playlists').doc(req.params.id).get(),
      { label: 'deleteAdminPlaylist:get' }
    );

    if (!docSnap.exists) return res.status(404).json({ error: 'Playlist not found' });
    if (!docSnap.data().isAdmin) return res.status(403).json({ error: 'Not an admin playlist' });

    const { coverStoragePath } = docSnap.data();
    if (coverStoragePath) await deleteAsset(coverStoragePath, { resource_type: 'image' });

    await deletePlaylist(req.params.id);
    res.json({ message: 'Playlist deleted successfully' });
  } catch (err) {
    logger.error('deleteAdminPlaylist error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};