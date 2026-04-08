/**
 * Artist.js
 *
 * Firestore schema definition and default factory for Artist documents.
 *
 * Collection: artists/{artistId}
 *
 * artistId is ALWAYS deterministic — computed via computeArtistId(name) in
 * normalizeEntity.js. Never use Firestore auto-generated IDs for artists.
 *
 * Design decisions:
 * - bio and imageUrl are never overwritten by a song upload (set-with-merge
 *   preserves them once an admin sets them manually).
 * - songCount and albumCount are maintained by find-or-create services and
 *   the migration script. They are best-effort counters — not used for access
 *   control, only for display.
 * - verified is an admin-only field for future use (e.g. checkmark badge).
 */

const ArtistSchema = {
  id:         'string',   // deterministic: "artist_arijit-singh"
  name:       'string',   // display name, preserved on merge
  nameLower:  'string',   // for case-insensitive search
  bio:        'string',   // admin-editable; never overwritten by upload
  imageUrl:   'string',   // admin-editable; never overwritten by upload
  songCount:  'number',   // incremented by findOrCreateArtist
  albumCount: 'number',   // incremented when a new album links to this artist
  verified:   'boolean',  // future: verified badge
  createdAt:  'timestamp',
  updatedAt:  'timestamp',
};

/**
 * createArtistDefaults(name, artistId) → object
 *
 * Returns a safe default payload for a new Artist document.
 * Used by findOrCreateArtist when building the set-with-merge payload.
 *
 * ⚠  Fields with merge: true semantics:
 *    - bio and imageUrl start as '' — once an admin sets them, subsequent
 *      song uploads will NOT overwrite them because set-with-merge only
 *      writes fields that are absent or explicitly included.
 *    - songCount and albumCount start at 0 on creation but are incremented
 *      using FieldValue.increment() — never reset by a merge write.
 *
 * @param {string} name     — normalized display name (original casing preserved)
 * @param {string} artistId — deterministic document ID
 * @returns {object}
 */
function createArtistDefaults(name, artistId) {
  const now = new Date();
  return {
    id:         artistId,
    name:       name.trim(),
    nameLower:  name.trim().toLowerCase(),
    bio:        '',
    imageUrl:   '',
    songCount:  0,
    albumCount: 0,
    verified:   false,
    createdAt:  now,
    updatedAt:  now,
  };
}

module.exports = { ArtistSchema, createArtistDefaults };