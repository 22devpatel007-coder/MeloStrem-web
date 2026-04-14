// ─── client/src/utils/errorMessages.js ───────────────────────────────────────
//
// Single source of truth for every user-facing error string in MeloStream.
//
// Rules:
//   • All messages must be safe to display — never expose Firebase codes,
//     Axios internals, stack traces, or server technical details.
//   • Messages should tell the user what happened AND what to do next.
//   • To change error copy for any error in the app, edit ONLY this file.
//   • Keys are the backend error.code strings from shared/constants/errorCodes.js
//     plus frontend-only codes (NETWORK_ERROR, UNKNOWN, etc.).
//
// USAGE:
//   import { getErrorMessage } from '../utils/errorMessages';
//   const msg = getErrorMessage('AUTH_TOKEN_EXPIRED'); // → 'Your session expired...'
//
//   // With action context for generic fallbacks:
//   const msg = getErrorMessage('UNKNOWN', { action: 'loading songs' });
//   // → 'Something went wrong while loading songs. Please try again.'
// ─────────────────────────────────────────────────────────────────────────────

// ── Error message map ─────────────────────────────────────────────────────────
// Keys match backend error codes from shared/constants/errorCodes.js.
// Add new entries here whenever a new error code is added to the backend.

const ERROR_MESSAGES = {
  // ── Auth errors (401) ──────────────────────────────────────────────────────
  AUTH_TOKEN_MISSING:
    'You need to be signed in to do that. Please log in and try again.',
  AUTH_TOKEN_INVALID:
    'Your session is invalid. Please log out and sign in again.',
  AUTH_TOKEN_EXPIRED:
    'Your session has expired. Please log in again to continue.',
  AUTH_TOKEN_REVOKED:
    'Your session was ended from another device. Please log in again.',
  AUTH_USER_NOT_FOUND:
    'We couldn\'t find your account. Please log in again.',

  // ── Authorisation errors (403) ────────────────────────────────────────────
  FORBIDDEN:
    'You don\'t have permission to do that.',
  ADMIN_REQUIRED:
    'This action requires admin access.',

  // ── Not found errors (404) ────────────────────────────────────────────────
  NOT_FOUND:
    'We couldn\'t find what you were looking for.',
  SONG_NOT_FOUND:
    'This song is no longer available.',
  ARTIST_NOT_FOUND:
    'This artist page is no longer available.',
  ALBUM_NOT_FOUND:
    'This album is no longer available.',
  PLAYLIST_NOT_FOUND:
    'This playlist is no longer available.',
  USER_NOT_FOUND:
    'User not found.',

  // ── Conflict errors (409) ─────────────────────────────────────────────────
  CONFLICT:
    'This action couldn\'t be completed because of a conflict. Please refresh and try again.',
  DUPLICATE_SONG:
    'This song already exists in the library.',
  PLAYLIST_NAME_TAKEN:
    'A playlist with that name already exists.',

  // ── Validation errors (400) ───────────────────────────────────────────────
  VALIDATION_ERROR:
    'Some information is missing or invalid. Please check your input and try again.',
  INVALID_PAYLOAD:
    'The request couldn\'t be processed. Please try again.',
  MISSING_REQUIRED_FIELD:
    'Please fill in all required fields.',
  FILE_TOO_LARGE:
    'The file you selected is too large. Please choose a smaller file.',
  INVALID_FILE_TYPE:
    'That file type isn\'t supported. Please select a valid audio or image file.',

  // ── Rate limit errors (429) ───────────────────────────────────────────────
  RATE_LIMIT_EXCEEDED:
    'You\'re doing that too quickly. Please wait a moment and try again.',
  TOO_MANY_REQUESTS:
    'Too many requests. Please slow down and try again in a minute.',

  // ── Server / service errors (5xx) ─────────────────────────────────────────
  INTERNAL_ERROR:
    'Something went wrong on our end. Please try again in a moment.',
  SERVICE_UNAVAILABLE:
    'MeloStream is temporarily unavailable. Please try again shortly.',
  DATABASE_ERROR:
    'We\'re having trouble accessing data right now. Please try again.',
  UPLOAD_FAILED:
    'The upload failed. Please check your connection and try again.',
  CLOUDINARY_ERROR:
    'Media upload failed. Please try again.',

  // ── Network / connectivity errors (client-side) ───────────────────────────
  NETWORK_ERROR:
    'Unable to reach the server. Please check your connection and try again.',
  TIMEOUT:
    'The request timed out. Please check your connection and try again.',
  ERR_CANCELED:
    '', // Silent — cancelled requests are never shown to users

  // ── Liked songs ───────────────────────────────────────────────────────────
  LIKE_FAILED:
    'Couldn\'t update your liked songs. Please try again.',

  // ── Playlist operations ───────────────────────────────────────────────────
  PLAYLIST_CREATE_FAILED:
    'Couldn\'t create the playlist. Please try again.',
  PLAYLIST_UPDATE_FAILED:
    'Couldn\'t update the playlist. Please try again.',
  PLAYLIST_DELETE_FAILED:
    'Couldn\'t delete the playlist. Please try again.',
  PLAYLIST_ADD_SONG_FAILED:
    'Couldn\'t add the song to the playlist. Please try again.',
  PLAYLIST_REMOVE_SONG_FAILED:
    'Couldn\'t remove the song from the playlist. Please try again.',

  // ── Search ────────────────────────────────────────────────────────────────
  SEARCH_FAILED:
    'Search is temporarily unavailable. Please try again.',

  // ── Generic fallback — must always be last ────────────────────────────────
  UNKNOWN:
    'Something went wrong. Please try again.',
};

// ── getErrorMessage ───────────────────────────────────────────────────────────

/**
 * Returns a user-friendly string for the given error code.
 *
 * Falls back gracefully:
 *   1. Exact code match → return its message
 *   2. Unknown code + action context → "Something went wrong while <action>."
 *   3. Network error → network message
 *   4. Hard fallback → generic "Something went wrong."
 *
 * @param {string}  code                    - Backend error code (e.g. 'AUTH_TOKEN_EXPIRED')
 * @param {object}  [options]
 * @param {string}  [options.action]        - Context string: 'loading songs', 'liking track'
 * @param {boolean} [options.isNetworkError] - True when the server was unreachable
 * @returns {string}
 */
export function getErrorMessage(code, options = {}) {
  const { action = '', isNetworkError = false } = options;

  // Network errors always get the network message regardless of code
  if (isNetworkError || code === 'NETWORK_ERROR') {
    return ERROR_MESSAGES.NETWORK_ERROR;
  }

  // Exact code match
  const mapped = ERROR_MESSAGES[code];
  if (mapped !== undefined) return mapped;

  // Unknown code with action context → contextual fallback
  if (action) {
    return `Something went wrong while ${action}. Please try again.`;
  }

  // Hard fallback
  return ERROR_MESSAGES.UNKNOWN;
}

/**
 * Returns true if the given code has a dedicated message entry.
 * Useful for tests and Phase 4 error reporting to detect unmapped codes.
 *
 * @param {string} code
 * @returns {boolean}
 */
export function isKnownErrorCode(code) {
  return Object.prototype.hasOwnProperty.call(ERROR_MESSAGES, code);
}

export default ERROR_MESSAGES;