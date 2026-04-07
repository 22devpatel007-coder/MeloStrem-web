/**
 * shared/constants/errorCodes.js
 *
 * SINGLE SOURCE OF TRUTH for all error codes across the MeloStream monorepo.
 *
 * HOW TO USE:
 *   Client  →  import { ERROR_CODES } from '../../../shared/constants/errorCodes';
 *   Server  →  const { ERROR_CODES } = require('../../../shared/constants/errorCodes');
 *
 * ADDING A NEW CODE:
 *   1. Add it here only.
 *   2. Delete the matching entry in client/src/constants/errorCodes.js (now a re-export shim).
 *   3. Delete the matching entry in server/src/constants/errorCodes.js (now a re-export shim).
 *   Never add codes to the shim files directly — they will silently diverge again.
 */

const ERROR_CODES = {
  // ── Auth / Token ────────────────────────────────────────────────────────────
  NO_TOKEN:                 'NO_TOKEN',
  TOKEN_INVALID_FORMAT:     'TOKEN_INVALID_FORMAT',
  TOKEN_EXPIRED:            'TOKEN_EXPIRED',
  TOKEN_REVOKED:            'TOKEN_REVOKED',
  TOKEN_MALFORMED:          'TOKEN_MALFORMED',
  TOKEN_CREDENTIAL_INVALID: 'TOKEN_CREDENTIAL_INVALID',
  TOKEN_UNKNOWN_ERROR:      'TOKEN_UNKNOWN_ERROR',

  // ── User / Account ──────────────────────────────────────────────────────────
  USER_DISABLED:            'USER_DISABLED',
  NOT_AUTHENTICATED:        'NOT_AUTHENTICATED',
  FORBIDDEN:                'FORBIDDEN',

  // ── Songs ───────────────────────────────────────────────────────────────────
  DUPLICATE_SONG:           'DUPLICATE_SONG',
  SONG_NOT_FOUND:           'SONG_NOT_FOUND',
  SONG_UPLOAD_FAILED:       'SONG_UPLOAD_FAILED',

  // ── Search ──────────────────────────────────────────────────────────────────
  SEARCH_ERROR:             'SEARCH_ERROR',

  // ── Playlists ───────────────────────────────────────────────────────────────
  PLAYLIST_NOT_FOUND:       'PLAYLIST_NOT_FOUND',
  PLAYLIST_DUPLICATE:       'PLAYLIST_DUPLICATE',

  // ── Generic ─────────────────────────────────────────────────────────────────
  INTERNAL_ERROR:           'INTERNAL_ERROR',
  VALIDATION_ERROR:         'VALIDATION_ERROR',
  NOT_FOUND:                'NOT_FOUND',
  RATE_LIMITED:             'RATE_LIMITED',
};

// Support both ESM (client) and CJS (server) without a build step.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ERROR_CODES };          // CJS  — Node / Express
} else {
  // ESM handled by the re-export shim on the client side.
}

export { ERROR_CODES };
export default ERROR_CODES;