/**
 * normalizeEntity.js
 *
 * Deterministic ID computation for Artist and Album documents.
 *
 * WHY THIS EXISTS:
 * Firestore has no unique-field constraint. Two concurrent uploads of the same
 * artist name would both query, both find nothing, and both create a new
 * document — producing duplicates. The only production-safe solution is to
 * compute the document ID from the normalized name BEFORE writing, then use
 * set({ merge: true }). Because the ID is deterministic, concurrent writes
 * converge on the same document and merge safely — no race condition possible.
 *
 * GUARANTEE:
 *   "Arijit Singh"  → artist_arijit-singh
 *   "arijit singh"  → artist_arijit-singh
 *   "ARIJIT SINGH"  → artist_arijit-singh
 *   "Arijit  Singh" → artist_arijit-singh  (collapsed spaces)
 *   "  Arijit Singh " → artist_arijit-singh (trimmed)
 */

/**
 * normalize(name) → string
 *
 * Lowercase, trim, collapse internal whitespace, strip invisible/zero-width
 * Unicode characters that could silently produce different IDs from visually
 * identical names.
 *
 * @param {string} name
 * @returns {string}
 */
function normalize(name) {
  if (typeof name !== 'string') return '';

  return name
    .trim()
    // Strip zero-width and invisible Unicode chars (U+200B–U+200D, U+FEFF, etc.)
    .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
    .toLowerCase()
    // Collapse any run of whitespace to a single space
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * slugify(str) → string
 *
 * Replace spaces with hyphens, remove every character that is not
 * alphanumeric or a hyphen. Safe for use as a Firestore document ID segment.
 *
 * @param {string} str — should already be normalized (lowercase, trimmed)
 * @returns {string}
 */
function slugify(str) {
  return str
    .replace(/\s+/g, '-')
    // Keep alphanumerics and hyphens; drop everything else (accents handled below)
    // First: transliterate common accented chars to ASCII equivalents
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip combining diacritical marks
    .replace(/[^a-z0-9-]/g, '')
    // Collapse consecutive hyphens (e.g. "A & B" → "a--b" → "a-b")
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, ''); // trim leading/trailing hyphens
}

/**
 * computeArtistId(name) → string
 *
 * Always returns a stable, lowercase Firestore-safe document ID for an artist.
 *
 * @param {string} name — raw artist name from admin form
 * @returns {string}  e.g. "artist_arijit-singh"
 */
function computeArtistId(name) {
  const slug = slugify(normalize(name));
  if (!slug) {
    throw new Error(`Cannot compute artistId — name normalized to empty string: "${name}"`);
  }
  return `artist_${slug}`;
}

/**
 * computeAlbumId(artistId, albumName) → string
 *
 * Albums are unique per artist+name pair. "Greatest Hits" by Artist A and
 * "Greatest Hits" by Artist B are different albums and get different IDs.
 *
 * @param {string} artistId  — the already-computed artist document ID
 * @param {string} albumName — raw album name from admin form
 * @returns {string}  e.g. "album_artist_arijit-singh_aashiqui-2"
 */
function computeAlbumId(artistId, albumName) {
  const albumSlug = slugify(normalize(albumName));
  if (!albumSlug) {
    throw new Error(`Cannot compute albumId — albumName normalized to empty string: "${albumName}"`);
  }
  // artistId already contains "artist_" prefix; combine directly
  return `album_${artistId}_${albumSlug}`;
}

module.exports = { normalize, slugify, computeArtistId, computeAlbumId };