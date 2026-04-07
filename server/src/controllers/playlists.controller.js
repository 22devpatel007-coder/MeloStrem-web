// ✅ FIX Bug (usePlaylists / playlists controller crash):
// Previously line 1 imported `getAdminPlaylists` from firebase.service —
// that function does NOT exist in firebase.service.js exports.
// Node.js destructures missing named exports as `undefined` silently,
// so any route that called getAdminPlaylists() threw:
//   "getAdminPlaylists is not a function"
// which propagated as a 500 to the client and broke usePlaylists on the frontend.
//
// Fix: remove `getAdminPlaylists` from the import — the controller implements
// that query itself using `db` directly (see exports.getAdminPlaylists below),
// which is the correct pattern for this admin-specific query.
const { deletePlaylist, createPlaylist } = require('../services/firebase.service');
const { checkDuplicateSong } = require('../utils/duplicateCheck');
const { uploadAudio, uploadCover, deleteAsset } = require('../services/cloudinary.service');
const { createSong } = require('../services/firebase.service');
const logger = require('../utils/logger');
const { db } = require('../config/firebase');

function serializeSong(id, data) {
  return {
    id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
  };
}

exports.uploadPlaylistSong = async (req, res) => {
  try {
    const { title, artist, genre, duration } = req.body;

    if (!title || !artist || !genre) {
      return res.status(400).json({ error: 'title, artist and genre are required' });
    }

    const existing = await checkDuplicateSong(title, artist);
    if (existing) {
      return res.json({
        status:   'duplicate',
        songId:   existing.id,
        existing: {
          id:        existing.id,
          title:     existing.title,
          artist:    existing.artist,
          createdAt: existing.createdAt,
        },
      });
    }

    if (!req.files?.['song']?.[0])  return res.status(400).json({ error: 'No song file received' });
    if (!req.files?.['cover']?.[0]) return res.status(400).json({ error: 'No cover file received' });

    const songFile  = req.files['song'][0];
    const coverFile = req.files['cover'][0];

    const [songResult, coverResult] = await Promise.all([
      uploadAudio(songFile.buffer, {
        folder:    'melostream/songs',
        public_id: `${Date.now()}-${title}`,
      }),
      uploadCover(coverFile.buffer, {
        folder:    'melostream/covers',
        public_id: `${Date.now()}-${title}-cover`,
      }),
    ]);

    const songData = {
      title,
      artist,
      genre,
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

    res.status(201).json({
      status: 'uploaded',
      songId: newSong.id,
      song:   serializeSong(newSong.id, songData),
    });
  } catch (err) {
    logger.error('uploadPlaylistSong error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

exports.createAdminPlaylist = async (req, res) => {
  try {
    const { name, description, songIds, coverUrl, coverStoragePath } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Playlist name is required' });

    let parsedSongIds = songIds;
    if (typeof songIds === 'string') {
      try { parsedSongIds = JSON.parse(songIds); } catch { parsedSongIds = []; }
    }
    if (!Array.isArray(parsedSongIds) || parsedSongIds.length === 0) {
      return res.status(400).json({ error: 'At least one song is required' });
    }

    const playlistData = {
      name:             name.trim(),
      description:      (description || '').trim(),
      ownerId:          req.user.uid,
      ownerEmail:       req.user.email,
      songIds:          parsedSongIds,
      coverUrl:         coverUrl || '',
      coverStoragePath: coverStoragePath || '',
      coverType:        'uploaded',
      isPublic:         true,
      isAdmin:          true,
      isFeatured:       false,
      createdAt:        new Date(),
      updatedAt:        new Date(),
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

exports.createAdminPlaylistWithCover = async (req, res) => {
  try {
    const { name, description, songIds } = req.body;

    if (!name || !name.trim()) return res.status(400).json({ error: 'Playlist name is required' });

    let parsedSongIds = songIds;
    if (typeof songIds === 'string') {
      try { parsedSongIds = JSON.parse(songIds); } catch { parsedSongIds = []; }
    }
    if (!Array.isArray(parsedSongIds) || parsedSongIds.length === 0) {
      return res.status(400).json({ error: 'At least one song is required' });
    }

    let coverUrl         = '';
    let coverStoragePath = '';
    const coverFile      = req.files?.['cover']?.[0];
    if (coverFile) {
      const coverResult = await uploadCover(coverFile.buffer, {
        folder:    'melostream/playlist-covers',
        public_id: `${Date.now()}-${name.trim()}-playlist-cover`,
      });
      coverUrl         = coverResult.secure_url;
      coverStoragePath = coverResult.public_id;
    }

    const playlistData = {
      name:             name.trim(),
      description:      (description || '').trim(),
      ownerId:          req.user.uid,
      ownerEmail:       req.user.email,
      songIds:          parsedSongIds,
      coverUrl,
      coverStoragePath,
      coverType:        'uploaded',
      isPublic:         true,
      isAdmin:          true,
      isFeatured:       false,
      createdAt:        new Date(),
      updatedAt:        new Date(),
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

exports.getAdminPlaylists = async (req, res) => {
  try {
    // This query is intentionally implemented here with db directly —
    // firebase.service does not export a getAdminPlaylists function.
    const snap = await db
      .collection('playlists')
      .where('isAdmin', '==', true)
      .orderBy('createdAt', 'desc')
      .get();

    const playlists = snap.docs.map((d) => {
      const data = d.data();
      return {
        id:        d.id,
        ...data,
        createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
        updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
      };
    });

    res.json(playlists);
  } catch (err) {
    logger.error('getAdminPlaylists error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};

exports.deleteAdminPlaylist = async (req, res) => {
  try {
    const docSnap = await db.collection('playlists').doc(req.params.id).get();
    if (!docSnap.exists) return res.status(404).json({ error: 'Playlist not found' });
    if (!docSnap.data().isAdmin) return res.status(403).json({ error: 'Not an admin playlist' });

    const { coverStoragePath } = docSnap.data();
    if (coverStoragePath) {
      await deleteAsset(coverStoragePath, { resource_type: 'image' });
    }

    await deletePlaylist(req.params.id);
    res.json({ message: 'Playlist deleted successfully' });
  } catch (err) {
    logger.error('deleteAdminPlaylist error:', { error: err.message });
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};