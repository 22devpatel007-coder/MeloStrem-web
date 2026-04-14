/**
 * server/src/container.js
 *
 * Phase 2 — Task 2.3 (complete): Dependency Injection Registry
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Single source of truth for all repository AND service instances.
 * All repositories and services are instantiated ONCE at process startup
 * and shared across all requests — Node.js singleton pattern.
 *
 * Why singletons matter:
 *   - Repositories hold circuit breaker state (OPEN/CLOSED/HALF_OPEN).
 *     Creating a new instance per-request would reset state on every call,
 *     defeating the entire circuit breaker purpose.
 *   - Services hold injected dependencies. Singleton services share the
 *     singleton repositories — no duplicate instances of circuit breakers.
 *   - Firebase Admin SDK manages its own connection pool internally.
 *     One db reference shared across all repositories is correct.
 *
 * Wiring order:
 *   1. Repositories are instantiated first (they depend only on db).
 *   2. Services are instantiated next (they depend on repositories +
 *      Cloudinary service module).
 *
 * Usage in controllers:
 *   const { songService } = require('../container');
 *   // call: await songService.getSongs(limit, cursor)
 *
 * Usage in routes (for legacy controllers not yet migrated to services):
 *   const { songRepository } = require('../container');
 *
 * Adding a new service:
 *   1. Create server/src/services/YourService.js
 *   2. Import it here
 *   3. Instantiate: const yourService = new YourService(repo1, repo2);
 *   4. Add to module.exports
 *   Controllers import from container.js — never instantiate services directly.
 *
 * ⚠  This file must be imported AFTER firebase.js has been initialized.
 *    server/src/index.js calls validateEnv() first, then requires this file.
 *    Never require container.js at the top of a module that may be imported
 *    before firebase.js is configured.
 */

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