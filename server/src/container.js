'use strict';

const { db } = require('./config/firebase');

// ── Repositories ──────────────────────────────────────────────────────────────
const SongRepository     = require('./repositories/SongRepository');
const UserRepository     = require('./repositories/UserRepository');
const PlaylistRepository = require('./repositories/PlaylistRepository');
const ArtistRepository   = require('./repositories/ArtistRepository');
const AlbumRepository    = require('./repositories/AlbumRepository');

// ── Services ──────────────────────────────────────────────────────────────────
const SongService     = require('./services/SongService');
const UserService     = require('./services/UserService');
const PlaylistService = require('./services/PlaylistService');
const ArtistService   = require('./services/ArtistService');
const AlbumService    = require('./services/AlbumService');

// ── Cloudinary service module (not a class — passed as dependency object) ─────
const cloudinaryService = require('./services/cloudinary.service');

// ══════════════════════════════════════════════════════════════════════════════
// Step 1 — Instantiate repositories
// Each instance holds its own circuit breaker state for its collection.
// ══════════════════════════════════════════════════════════════════════════════
const songRepository     = new SongRepository(db);
const userRepository     = new UserRepository(db);
const playlistRepository = new PlaylistRepository(db);
const artistRepository   = new ArtistRepository(db);
const albumRepository    = new AlbumRepository(db);

// ══════════════════════════════════════════════════════════════════════════════
// Step 2 — Instantiate services with injected dependencies
// Services depend on repositories and (where needed) cloudinaryService.
// ══════════════════════════════════════════════════════════════════════════════

/**
 * songService — handles all songs domain business logic.
 * Depends on: songRepository, cloudinaryService
 * Used by: songs.controller.js
 */
const songService = new SongService(songRepository, cloudinaryService);

/**
 * userService — handles liked songs, session picks, user listing.
 * Depends on: userRepository, songRepository (for liked songs full fetch)
 * Used by: users.controller.js
 */
const userService = new UserService(userRepository, songRepository);

/**
 * playlistService — handles playlist CRUD, cover uploads, song-in-playlist uploads.
 * Depends on: playlistRepository, songRepository (for batch song resolution)
 * Used by: playlists.controller.js
 */
const playlistService = new PlaylistService(playlistRepository, songRepository);

/**
 * artistService — handles artist reads and paginated artist songs.
 * Depends on: artistRepository, songRepository
 * Used by: artists.controller.js
 */
const artistService = new ArtistService(artistRepository, songRepository);

/**
 * albumService — handles album reads and album song listing.
 * Depends on: albumRepository, songRepository
 * Used by: albums.controller.js
 */
const albumService = new AlbumService(albumRepository, songRepository);

// ══════════════════════════════════════════════════════════════════════════════
// Export all singletons
// ══════════════════════════════════════════════════════════════════════════════
module.exports = {
  // ── Repositories (available for legacy code or direct access if needed) ────
  songRepository,
  userRepository,
  playlistRepository,
  artistRepository,
  albumRepository,

  // ── Services (preferred — controllers should import these, not repositories) ─
  songService,
  userService,
  playlistService,
  artistService,
  albumService,
};