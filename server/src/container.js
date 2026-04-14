/**
 * server/src/container.js
 *
 * Phase 2 — Task 2.3 (partial): Dependency Injection Registry
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Single source of truth for all repository (and future service) instances.
 * All repositories are instantiated ONCE at process startup and shared
 * across all requests — this is the Node.js singleton pattern.
 *
 * Why this matters:
 *   - Repositories hold circuit breaker state (failure count, OPEN/CLOSED).
 *     If a new instance were created per-request, circuit breaker state would
 *     reset on every call and never open — defeating the entire purpose.
 *   - Single instantiation means one db connection pool is shared across all
 *     repositories, which is correct for Firebase Admin SDK (it manages its
 *     own connection pool internally).
 *
 * Usage in controllers:
 *   const { songRepository } = require('../container');
 *   // then call: await songRepository.findAll(limit, cursor)
 *
 * Usage in service classes (Phase 2, Task 2.3):
 *   const { songRepository, cloudinaryService } = require('../container');
 *   const songService = new SongService(songRepository, cloudinaryService);
 *   // or import the pre-built songService singleton below
 *
 * Adding a new repository:
 *   1. Create server/src/repositories/YourRepository.js
 *   2. Import it here
 *   3. Instantiate: const yourRepository = new YourRepository(db);
 *   4. Add to module.exports
 *   Controllers and services import from container.js — never instantiate directly.
 *
 * ⚠  This file must be imported AFTER firebase.js has been initialized.
 *    server/src/index.js calls validateEnv() first, then requires this file.
 *    Never require container.js at the top of a module that may be imported
 *    before firebase.js is configured.
 */

'use strict';

const { db } = require('./config/firebase');

const SongRepository     = require('./repositories/SongRepository');
const UserRepository     = require('./repositories/UserRepository');
const PlaylistRepository = require('./repositories/PlaylistRepository');
const ArtistRepository   = require('./repositories/ArtistRepository');
const AlbumRepository    = require('./repositories/AlbumRepository');

// ── Instantiate repositories once ────────────────────────────────────────────
// Each instance holds its own circuit breaker state for its collection.
// Shared across all requests for the lifetime of the process.
const songRepository     = new SongRepository(db);
const userRepository     = new UserRepository(db);
const playlistRepository = new PlaylistRepository(db);
const artistRepository   = new ArtistRepository(db);
const albumRepository    = new AlbumRepository(db);

// ── Export all singletons ─────────────────────────────────────────────────────
module.exports = {
  // Repositories
  songRepository,
  userRepository,
  playlistRepository,
  artistRepository,
  albumRepository,

  // Services will be added here in Phase 2 Task 2.3:
  // songService, userService, playlistService, artistService, albumService
};