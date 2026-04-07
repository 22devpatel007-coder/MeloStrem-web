// PERMANENT FIX: Added `genre` field to SongSchema and createSongDefaults.
//
// Root cause of "Unknown" badge: genre was never in the schema, so upload
// forms and migration scripts didn't write it to Firestore. When SongCard
// reads song.genre it gets undefined — which some callers coerced to the
// string "Unknown". Adding it here ensures:
//   1. New uploads always store a genre value (empty string if not provided).
//   2. createSongDefaults() produces a safe empty string, never undefined.
//   3. SongCard's existing guard `{song.genre && ...}` correctly hides the
//      badge when genre is an empty string.

const SongSchema = {
  id:          'string',
  title:       'string',
  artist:      'string',
  album:       'string',
  genre:       'string',   // ← ADDED
  duration:    'number',
  audioUrl:    'string',
  coverUrl:    'string',
  titleLower:  'string',
  artistLower: 'string',
  createdAt:   'timestamp',
  uploadedBy:  'string',
  featured:    'boolean',  // ← ADDED (SongCard already renders ⭐ for this)
};

const createSongDefaults = () => ({
  album:       '',
  genre:       '',          // ← ADDED — empty string, not undefined
  duration:    0,
  coverUrl:    '',
  titleLower:  '',
  artistLower: '',
  createdAt:   new Date(),
  uploadedBy:  '',
  featured:    false,       // ← ADDED
});

module.exports = { SongSchema, createSongDefaults };