/**
 * Album.js
 *
 * Firestore schema definition and default factory for Album documents.
 *
 * Collection: albums/{albumId}
 *
 * albumId is ALWAYS deterministic — computed via computeAlbumId(artistId, albumName)
 * in normalizeEntity.js. Never use Firestore auto-generated IDs for albums.
 *
 * Design decisions:
 * - Albums are scoped to an artist. "Greatest Hits" by Artist A and "Greatest
 *   Hits" by Artist B get different IDs because artistId is part of the key.
 * - coverUrl is taken from the first song uploaded to this album and preserved
 *   on subsequent merges (admin can override manually).
 * - songCount is a best-effort display counter maintained by find-or-create.
 * - year is extracted from the first song upload; never overwritten on merge.
 */

const AlbumSchema = {
  id:        'string',    // deterministic: "album_artist_arijit-singh_aashiqui-2"
  name:      'string',    // display name, preserved on merge
  nameLower: 'string',    // for case-insensitive search
  artistId:  'string',    // parent artist document ID
  artistName:'string',    // denormalized for display without extra fetch
  coverUrl:  'string',    // from first song upload; preserved on merge
  genre:     'string',    // from first song upload; preserved on merge
  year:      'number',    // from first song upload; preserved on merge
  songCount: 'number',    // incremented by findOrCreateAlbum
  createdAt: 'timestamp',
  updatedAt: 'timestamp',
};

/**
 * createAlbumDefaults(params) → object
 *
 * Returns a safe default payload for a new Album document.
 * Used by findOrCreateAlbum when building the set-with-merge payload.
 *
 * ⚠  Fields with merge: true semantics:
 *    - coverUrl, genre, year are set on first creation and preserved on all
 *      subsequent uploads to the same album.
 *    - songCount starts at 0 and is incremented via FieldValue.increment().
 *
 * @param {object} params
 * @param {string} params.albumId    — deterministic document ID
 * @param {string} params.name       — raw album name (display casing)
 * @param {string} params.artistId   — parent artist document ID
 * @param {string} params.artistName — display artist name
 * @param {string} [params.coverUrl] — cover image URL from song upload
 * @param {string} [params.genre]    — genre from song upload
 * @param {number} [params.year]     — release year (optional)
 * @returns {object}
 */
function createAlbumDefaults({ albumId, name, artistId, artistName, coverUrl = '', genre = '', year = 0 }) {
  const now = new Date();
  return {
    id:         albumId,
    name:       name.trim(),
    nameLower:  name.trim().toLowerCase(),
    artistId,
    artistName: artistName.trim(),
    coverUrl,
    genre,
    year,
    songCount:  0,
    createdAt:  now,
    updatedAt:  now,
  };
}

module.exports = { AlbumSchema, createAlbumDefaults };