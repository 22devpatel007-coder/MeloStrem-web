'use strict';

const { checkDuplicateSong }                         = require('../utils/duplicateCheck');
const { uploadAudio, uploadCover, deleteAsset }      = require('../services/cloudinary.service');
const { createSong, createPlaylist, deletePlaylist } = require('../services/firebase.service');
const logger                                         = require('../utils/logger');
const {
  ValidationError,
  ForbiddenError,
  NotFoundError,
  InternalError,
} = require('../errors');

class PlaylistService {
  constructor(playlistRepository, songRepository) {
    if (!playlistRepository) throw new Error('PlaylistService: playlistRepository is required');
    if (!songRepository)     throw new Error('PlaylistService: songRepository is required');
    this._playlistRepo = playlistRepository;
    this._songRepo     = songRepository;
  }

  // ── READ ────────────────────────────────────────────────────────────────────

  async getPublicAdminPlaylists() {
    try {
      const playlists = await this._playlistRepo.findAllPublic();
      return playlists.filter((p) => p.isAdmin === true);
    } catch (err) {
      logger.error('PlaylistService.getPublicAdminPlaylists error:', { error: err.message });
      throw this._wrapError(err, 'Could not load library playlists. Please try again.', 'PLAYLISTS_FETCH_ERROR');
    }
  }

  async getUserPlaylists(uid) {
    try {
      const playlists = await this._playlistRepo.findByUserId(uid);
      return playlists.filter((p) => p.isAdmin !== true);
    } catch (err) {
      logger.error('PlaylistService.getUserPlaylists error:', { uid, error: err.message });
      throw this._wrapError(err, 'Could not load your playlists. Please try again.', 'USER_PLAYLISTS_FETCH_ERROR');
    }
  }

  async getAdminPlaylists() {
    try {
      const playlists = await this._playlistRepo.executeWithRetry(async () => {
        const snap = await this._playlistRepo._db
          .collection('playlists')
          .where('isAdmin', '==', true)
          .orderBy('createdAt', 'desc')
          .get();
        return snap.docs.map((doc) => this._playlistRepo.formatDoc(doc));
      }, 'getAdminPlaylists');
      return playlists;
    } catch (err) {
      logger.error('PlaylistService.getAdminPlaylists error:', { error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  // ── WRITE ───────────────────────────────────────────────────────────────────

  async createAdminPlaylist(body, uid, userEmail) {
    const { name, description, songIds, coverUrl, coverStoragePath } = body;
    if (!name || !name.trim()) throw new ValidationError('Playlist name is required', 'VALIDATION_ERROR');
    const parsedSongIds = this._parseSongIds(songIds);
    const now = new Date();
    const playlistData = {
      name: name.trim(), description: (description || '').trim(),
      ownerId: uid, ownerEmail: userEmail, songIds: parsedSongIds,
      coverUrl: coverUrl || '', coverStoragePath: coverStoragePath || '',
      coverType: 'uploaded', isPublic: true, isAdmin: true, isFeatured: false,
      createdAt: now, updatedAt: now,
    };
    try {
      const newPlaylist     = await createPlaylist(playlistData);
      newPlaylist.createdAt = now.toISOString();
      newPlaylist.updatedAt = now.toISOString();
      return newPlaylist;
    } catch (err) {
      logger.error('PlaylistService.createAdminPlaylist error:', { error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  async createAdminPlaylistWithCover(body, files, uid, userEmail) {
    const { name, description, songIds } = body;
    if (!name || !name.trim()) throw new ValidationError('Playlist name is required', 'VALIDATION_ERROR');
    const parsedSongIds = this._parseSongIds(songIds);
    let coverUrl = '', coverStoragePath = '';
    const coverFile = files?.['cover']?.[0];
    if (coverFile) {
      try {
        const coverResult = await uploadCover(coverFile.buffer, {
          folder: 'melostream/playlist-covers',
          public_id: `${Date.now()}-${name.trim()}-playlist-cover`,
        });
        coverUrl         = coverResult.secure_url;
        coverStoragePath = coverResult.public_id;
      } catch (err) {
        logger.error('PlaylistService.createAdminPlaylistWithCover upload error:', { error: err.message });
        throw new InternalError('Cover upload failed. Please try again.', 'UPLOAD_ERROR', { originalError: err.message });
      }
    }
    const now = new Date();
    const playlistData = {
      name: name.trim(), description: (description || '').trim(),
      ownerId: uid, ownerEmail: userEmail, songIds: parsedSongIds,
      coverUrl, coverStoragePath, coverType: 'uploaded',
      isPublic: true, isAdmin: true, isFeatured: false,
      createdAt: now, updatedAt: now,
    };
    try {
      const newPlaylist     = await createPlaylist(playlistData);
      newPlaylist.createdAt = now.toISOString();
      newPlaylist.updatedAt = now.toISOString();
      return newPlaylist;
    } catch (err) {
      logger.error('PlaylistService.createAdminPlaylistWithCover Firestore error:', { error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  async uploadPlaylistSong(body, files, uid) {
    const { title, artist, genre, duration } = body;
    if (!title || !artist || !genre) throw new ValidationError('title, artist and genre are required', 'VALIDATION_ERROR');
    const existing = await checkDuplicateSong(title, artist);
    if (existing) {
      return {
        status: 'duplicate', songId: existing.id,
        existing: { id: existing.id, title: existing.title, artist: existing.artist, createdAt: existing.createdAt },
      };
    }
    if (!files?.['song']?.[0])  throw new ValidationError('No song file received',  'MISSING_FILE');
    if (!files?.['cover']?.[0]) throw new ValidationError('No cover file received', 'MISSING_FILE');
    const songFile  = files['song'][0];
    const coverFile = files['cover'][0];
    let songResult, coverResult;
    try {
      [songResult, coverResult] = await Promise.all([
        uploadAudio(songFile.buffer,  { folder: 'melostream/songs',  public_id: `${Date.now()}-${title}` }),
        uploadCover(coverFile.buffer, { folder: 'melostream/covers', public_id: `${Date.now()}-${title}-cover` }),
      ]);
    } catch (err) {
      logger.error('PlaylistService.uploadPlaylistSong Cloudinary error:', { error: err.message });
      throw new InternalError('File upload failed. Please try again.', 'UPLOAD_ERROR', { originalError: err.message });
    }
    const now = new Date();
    const songData = {
      title, artist, genre,
      titleLower: title.toLowerCase(), artistLower: artist.toLowerCase(),
      duration: Number(duration) || 0,
      fileUrl: songResult.secure_url, coverUrl: coverResult.secure_url,
      storagePath: songResult.public_id, coverStoragePath: coverResult.public_id,
      playCount: 0, featured: false, uploadedBy: uid,
      createdAt: now, updatedAt: now,
    };
    try {
      const newSong = await createSong(songData);
      return { status: 'uploaded', songId: newSong.id, song: this._serializeDoc(newSong.id, songData) };
    } catch (err) {
      logger.error('PlaylistService.uploadPlaylistSong Firestore error:', { error: err.message });
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }
  }

  /**
   * deleteAdminPlaylist(id, userRepository) → { message }
   *
   * 1. Fetch + validate playlist is an admin playlist
   * 2. Delete Cloudinary cover synchronously (best-effort)
   * 3. Fire cascade delete fire-and-forget (songs + playlist doc)
   * 4. Return { message } immediately — HTTP response is sent before cascade completes
   */
  async deleteAdminPlaylist(id, userRepository) {
    let playlist;
    try {
      playlist = await this._playlistRepo.findById(id);
    } catch (err) {
      throw this._wrapError(err, 'Something went wrong. Please try again.', 'INTERNAL_ERROR');
    }

    if (!playlist) throw new NotFoundError('Playlist not found', 'NOT_FOUND');
    if (!playlist.isAdmin) throw new ForbiddenError('Not an admin playlist', 'FORBIDDEN');

    // Delete playlist cover from Cloudinary before responding
    if (playlist.coverStoragePath) {
      try {
        await deleteAsset(playlist.coverStoragePath, { resource_type: 'image' });
      } catch (err) {
        logger.warn('PlaylistService.deleteAdminPlaylist: cover delete failed', { id, error: err.message });
      }
    }

    const songIds = Array.isArray(playlist.songIds)
      ? playlist.songIds.filter(Boolean)
      : [];

    // Fire-and-forget — not awaited, runs after HTTP response is sent
    this._cascadeDeleteSongs(id, songIds, userRepository).catch((err) => {
      logger.error('PlaylistService._cascadeDeleteSongs unhandled error:', {
        playlistId: id, error: err.message,
      });
    });

    return { message: 'Playlist deleted successfully' };
  }

  /**
   * _cascadeDeleteSongs — runs entirely after HTTP response is sent.
   * For each song: delete Cloudinary audio → delete Cloudinary cover →
   * delete Firestore song doc → remove from all users likedSongs.
   * Then deletes the playlist document LAST.
   * One song failure never blocks the rest.
   */
  async _cascadeDeleteSongs(playlistId, songIds, userRepository) {
    logger.info('PlaylistService._cascadeDeleteSongs: starting', {
      playlistId, songCount: songIds.length,
    });

    for (const songId of songIds) {
      try {
        const song = await this._songRepo.findById(songId);

        if (song) {
          if (song.storagePath) {
            try {
              await deleteAsset(song.storagePath, { resource_type: 'video' });
            } catch (err) {
              logger.warn('PlaylistService._cascadeDeleteSongs: audio delete failed', {
                playlistId, songId, error: err.message,
              });
            }
          }
          if (song.coverStoragePath) {
            try {
              await deleteAsset(song.coverStoragePath, { resource_type: 'image' });
            } catch (err) {
              logger.warn('PlaylistService._cascadeDeleteSongs: cover delete failed', {
                playlistId, songId, error: err.message,
              });
            }
          }
        }

        await this._songRepo.delete(songId);

        if (userRepository) {
          try {
            await userRepository.removeSongFromAllUsers(songId);
          } catch (err) {
            logger.warn('PlaylistService._cascadeDeleteSongs: liked-songs cleanup failed', {
              playlistId, songId, error: err.message,
            });
          }
        }

        logger.info('PlaylistService._cascadeDeleteSongs: song deleted', { playlistId, songId });
      } catch (err) {
        logger.error('PlaylistService._cascadeDeleteSongs: failed for song', {
          playlistId, songId, error: err.message,
        });
      }
    }

    // Delete playlist document LAST — after all songs are cleaned
    try {
      await deletePlaylist(playlistId);
      logger.info('PlaylistService._cascadeDeleteSongs: playlist doc deleted', { playlistId });
    } catch (err) {
      logger.error('PlaylistService._cascadeDeleteSongs: playlist doc delete failed', {
        playlistId, error: err.message,
      });
    }
  }

  // ── PRIVATE HELPERS ─────────────────────────────────────────────────────────

  _parseSongIds(songIds) {
    let parsed = songIds;
    if (typeof songIds === 'string') {
      try { parsed = JSON.parse(songIds); } catch { parsed = []; }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new ValidationError('At least one song is required', 'VALIDATION_ERROR');
    }
    return parsed;
  }

  _serializeDoc(id, data) {
    return {
      id, ...data,
      createdAt: data.createdAt instanceof Date ? data.createdAt.toISOString() : data.createdAt ?? null,
      updatedAt: data.updatedAt instanceof Date ? data.updatedAt.toISOString() : data.updatedAt ?? null,
    };
  }

  _wrapError(err, message, code) {
    if (err.isOperational !== undefined) return err;
    return new InternalError(message, code, { originalError: err.message });
  }
}

module.exports = PlaylistService;