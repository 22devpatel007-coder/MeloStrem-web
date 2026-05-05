/**
 * server/src/repositories/SongRepository.js
 *
 * Phase 2 — Task 2.1
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * All Firestore access for the songs collection.
 * Extends BaseRepository — every call goes through the circuit breaker
 * and retryFirestore automatically.
 *
 * Methods:
 *   findAll(limit, cursor)               — paginated song list (library)
 *   findById(id)                         — single song by Firestore doc ID
 *   findByIds(ids)                       — batch fetch (playlist resolution)
 *   searchByTitle(query, limit)          — prefix search on titleLower
 *   searchByArtist(query, limit)         — prefix search on artistLower
 *   search(query, limit)                 — merged title + artist search
 *   findByArtistId(artistId, limit, cursor) — paginated artist songs
 *   findByAlbumId(albumId)               — album songs ordered by trackNumber
 *   checkDuplicate(title, artist, excludeId) — duplicate detection
 *   create(data)                         — add new song document
 *   update(id, data)                     — partial update existing song
 *   delete(id)                           — delete song document
 *
 * Query caps (enforced server-side — see BaseRepository):
 *   Songs list / search / artist songs: MAX_QUERY_LIMIT  (50)
 *   Album songs:                        MAX_ALBUM_SONGS  (200)
 *   Batch get:                          MAX_BATCH_SIZE   (500)
 *
 * Firestore indexes required (must exist in firestore.indexes.json):
 *   songs: createdAt DESC           — findAll cursor pagination
 *   songs: titleLower ASC           — searchByTitle range query
 *   songs: artistLower ASC          — searchByArtist range query
 *   songs: artistId + trackNumber   — findByArtistId ordered by track
 *   songs: albumId + trackNumber    — findByAlbumId ordered by track
 */

'use strict';
const { Song } = require('../models/Song');
const BaseRepository = require('./BaseRepository');

class SongRepository extends BaseRepository {
  /**
   * @param {FirebaseFirestore.Firestore} db
   */
  constructor(db) {
    super(db, 'songs');
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // READ METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * findAll(limit, cursor) → { items, nextCursor, hasMore }
   *
   * Paginated song library list, ordered by createdAt DESC (newest first).
   * Used by GET /api/songs — feeds useSongs infinite query on the frontend.
   *
   * @param {number}      limit   — page size, capped at 50
   * @param {string|null} cursor  — Firestore doc ID of last item on previous page
   * @returns {Promise<{ items: object[], nextCursor: string|null, hasMore: boolean }>}
   */
  async findAll(limit = 30, cursor = null) {
  const baseQuery = this._db
    .collection('songs')
    .orderBy('createdAt', 'desc');

  const result = await this.findPaginated(baseQuery, limit, cursor);
  return { ...result, items: result.items.map((r) => Song.fromFirestore(r)) };
}
  /**
   * findAllIds() → string[]
   *
   * Returns all song IDs in the collection — lightweight, no field reads.
   * Used by GET /api/songs/ids for client-side shuffle seed generation.
   * Covered by server-side 60s cache (same TTL as songs list).
   * select('__name__') tells Firestore to return document refs only — no field data transferred.
   */
  async findAllIds() {
    return this._callFirestore(async () => {
      const snap = await this._db
        .collection('songs')
        .select()
        .get();
      return snap.docs.map((doc) => doc.id);
    }, 'findAllIds');
  }
  /**
   * findById(id) → object | null
   *
   * @param {string} id — Firestore document ID
   * @returns {Promise<object | null>}
   */
  async findById(id) {
    const raw = await super.findById(id);
    return raw ? Song.fromFirestore(raw) : null;
  }

  /**
   * findByIds(ids) → object[]
   *
   * Batch fetch songs by ID array. Used by POST /api/songs/batch (playlist resolution).
   * Missing IDs are silently skipped. Batch capped at MAX_BATCH_SIZE (500).
   *
   * @param {string[]} ids
   * @returns {Promise<object[]>}
   */
  async findByIds(ids) {
    const raws = await this.batchGet(ids);
    return raws.map((r) => Song.fromFirestore(r));
  }

  /**
   * searchByTitle(query, limit) → object[]
   *
   * Firestore prefix range query on titleLower field.
   * Requires Firestore index: songs / titleLower ASC.
   *
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async searchByTitle(query, limit = 20) {
    const safeLimit   = Math.min(limit, BaseRepository.MAX_QUERY_LIMIT);
    const queryLower  = query.toLowerCase();

    return this._callFirestore(async () => {
      const snap = await this._db
        .collection('songs')
        .where('titleLower', '>=', queryLower)
        .where('titleLower', '<=', queryLower + '\uf8ff')
        .limit(safeLimit)
        .get();
      return snap.docs.map((doc) => Song.fromFirestore(this.formatDoc(doc)));
    }, `searchByTitle("${query}")`);
  }

  /**
   * searchByArtist(query, limit) → object[]
   *
   * Firestore prefix range query on artistLower field.
   * Requires Firestore index: songs / artistLower ASC.
   *
   * @param {string} query
   * @param {number} limit
   * @returns {Promise<object[]>}
   */
  async searchByArtist(query, limit = 20) {
    const safeLimit   = Math.min(limit, BaseRepository.MAX_QUERY_LIMIT);
    const queryLower  = query.toLowerCase();

    return this._callFirestore(async () => {
      const snap = await this._db
        .collection('songs')
        .where('artistLower', '>=', queryLower)
        .where('artistLower', '<=', queryLower + '\uf8ff')
        .limit(safeLimit)
        .get();
      return snap.docs.map((doc) => Song.fromFirestore(this.formatDoc(doc)));
    }, `searchByArtist("${query}")`);
  }

  /**
   * search(query, limit) → { songs, total, query }
   *
   * Merged title + artist search. Deduplicates results by document ID.
   * Runs both queries in parallel for minimum latency.
   * Returns API contract shape: { songs, total, query }.
   *
   * @param {string} query
   * @param {number} limit  — applied per sub-query and to final merged result
   * @returns {Promise<{ songs: object[], total: number, query: string }>}
   */
  async search(query, limit = 20) {
    const safeLimit = Math.min(limit, BaseRepository.MAX_QUERY_LIMIT);

    const [titleResults, artistResults] = await Promise.all([
      this.searchByTitle(query, safeLimit),
      this.searchByArtist(query, safeLimit),
    ]);

    // Merge and deduplicate by document ID
    const resultsMap = new Map();
    titleResults.forEach((song)  => resultsMap.set(song.id, song));
    artistResults.forEach((song) => resultsMap.set(song.id, song));

    const combined = Array.from(resultsMap.values()).slice(0, safeLimit);
    return { songs: combined, total: combined.length, query };
  }

  /**
   * findByArtistId(artistId, limit, cursor) → { items, nextCursor, hasMore }
   *
   * Paginated songs for a given artist, ordered by trackNumber ASC.
   * Used by GET /api/artists/:id/songs.
   * Requires Firestore composite index: songs / artistId + trackNumber ASC.
   *
   * @param {string}      artistId
   * @param {number}      limit
   * @param {string|null} cursor
   * @returns {Promise<{ items: object[], nextCursor: string|null, hasMore: boolean }>}
   */
  async findByArtistId(artistId, limit = 30, cursor = null) {
  const baseQuery = this._db
    .collection('songs')
    .where('artistId', '==', artistId)
    .orderBy('createdAt', 'desc');

  const result = await this.findPaginated(baseQuery, limit, cursor);
  return { ...result, items: result.items.map((r) => Song.fromFirestore(r)) };
}

  /**
   * findByAlbumId(albumId) → object[]
   *
   * All songs for a given album, ordered by trackNumber ASC.
   * Non-paginated (albums are small — cap at MAX_ALBUM_SONGS = 200).
   * Used by GET /api/albums/:id/songs.
   * Requires Firestore composite index: songs / albumId + trackNumber ASC.
   *
   * @param {string} albumId
   * @returns {Promise<object[]>}
   */
  async findByAlbumId(albumId) {
    return this._callFirestore(async () => {
      const snap = await this._db
        .collection('songs')
        .where('albumId', '==', albumId)
        .orderBy('trackNumber', 'asc')
        .limit(BaseRepository.MAX_ALBUM_SONGS)
        .get();
      return snap.docs.map((doc) => Song.fromFirestore(this.formatDoc(doc)));
    }, `findByAlbumId(${albumId})`);
  }

  /**
   * checkDuplicate(title, artist, excludeId?) → object | null
   *
   * Exact match on titleLower + artistLower.
   * Returns the existing song data if a duplicate is found, null otherwise.
   * Pass excludeId to skip a specific document (used during updateSong).
   *
   * @param {string}      title
   * @param {string}      artist
   * @param {string|null} [excludeId]
   * @returns {Promise<object | null>}
   */
  async checkDuplicate(title, artist, excludeId = null) {
    return this._callFirestore(async () => {
      const snap = await this._db
        .collection('songs')
        .where('titleLower', '==', title.toLowerCase())
        .where('artistLower', '==', artist.toLowerCase())
        .limit(2)
        .get();

      if (snap.empty) return null;

      if (excludeId) {
        const dups = snap.docs.filter((doc) => doc.id !== excludeId);
        return dups.length > 0 ? Song.fromFirestore(this.formatDoc(dups[0])) : null;
      }

      return Song.fromFirestore(this.formatDoc(snap.docs[0]));
    }, `checkDuplicate("${title}" by "${artist}")`);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // WRITE METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * create(data) → object
   *
   * Add a new song document with Firestore auto-generated ID.
   *
   * @param {object} data — full song payload (see Song.js SongSchema)
   * @returns {Promise<object>}
   */
  async create(data) {
    return super.create(data);
  }

  /**
   * update(id, data) → object
   *
   * Partial update for an existing song document.
   *
   * @param {string} id   — Firestore document ID
   * @param {object} data — fields to update
   * @returns {Promise<object>}
   */
  async update(id, data) {
    return super.update(id, data);
  }

  /**
   * delete(id) → boolean
   *
   * @param {string} id — Firestore document ID
   * @returns {Promise<boolean>}
   */
  async delete(id) {
    return super.delete(id);
  }
}

module.exports = SongRepository;