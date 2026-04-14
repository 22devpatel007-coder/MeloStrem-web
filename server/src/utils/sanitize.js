/**
 * server/src/utils/sanitize.js
 *
 * Phase 1 — Task 1.2: Input Sanitization (Backend)
 *
 * Strips HTML tags and script content from user-supplied string fields
 * before they are written to Firestore. Called in songs.controller.js
 * on all POST (uploadSong) and PATCH (updateSong) operations, after Joi
 * validation passes and before any Firestore write.
 *
 * Uses the `sanitize-html` package with a zero-allowlist config so that
 * ALL tags, attributes, and protocols are stripped — not just a denylist.
 * A zero-allowlist is the only safe default for stored content.
 *
 * Install: npm install sanitize-html   (server/)
 */

const sanitizeHtml = require('sanitize-html');

/**
 * Shared sanitize-html options.
 * allowedTags: []        — strip every HTML tag, keep inner text only
 * allowedAttributes: {}  — strip every attribute
 * disallowedTagsMode: 'discard' — remove tag + content for script/style
 *
 * @type {import('sanitize-html').IOptions}
 */
const STRIP_ALL = {
  allowedTags: [],
  allowedAttributes: {},
  disallowedTagsMode: 'discard',
};

/**
 * Sanitizes a single string value.
 * Returns the cleaned string, or an empty string for non-string input.
 *
 * @param {*} value
 * @returns {string}
 */
function sanitizeStr(value) {
  if (typeof value !== 'string') return '';
  return sanitizeHtml(value, STRIP_ALL).trim();
}

/**
 * Sanitizes all user-supplied string fields on a song metadata object.
 *
 * Fields sanitized: title, artist, album, genre
 * Fields intentionally NOT touched: numeric/boolean fields (duration,
 * trackNumber, featured), internal IDs (artistId, albumId), URLs set by
 * Cloudinary (fileUrl, coverUrl, storagePath, coverStoragePath), and
 * server-set timestamps (createdAt, updatedAt).
 *
 * The returned object is a shallow copy — the original is never mutated.
 *
 * Usage (songs.controller.js):
 *   const sanitized = sanitizeSongMeta(req.body);
 *   // use sanitized.title, sanitized.artist, etc. for Firestore write
 *
 * @param {object} data — raw body fields (title, artist, album, genre, …)
 * @returns {object}    — sanitized copy; safe to write to Firestore
 */
function sanitizeSongMeta(data) {
  if (!data || typeof data !== 'object') return {};

  const out = { ...data };

  if (data.title  !== undefined) out.title  = sanitizeStr(data.title);
  if (data.artist !== undefined) out.artist = sanitizeStr(data.artist);
  if (data.album  !== undefined) out.album  = sanitizeStr(data.album);
  if (data.genre  !== undefined) out.genre  = sanitizeStr(data.genre);

  return out;
}

/**
 * Sanitizes user-supplied string fields on a playlist metadata object.
 *
 * Fields sanitized: name, description
 *
 * @param {object} data
 * @returns {object}
 */
function sanitizePlaylistMeta(data) {
  if (!data || typeof data !== 'object') return {};

  const out = { ...data };

  if (data.name        !== undefined) out.name        = sanitizeStr(data.name);
  if (data.description !== undefined) out.description = sanitizeStr(data.description);

  return out;
}

module.exports = { sanitizeSongMeta, sanitizePlaylistMeta, sanitizeStr };