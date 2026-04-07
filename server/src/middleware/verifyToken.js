/**
 * server/src/middleware/verifyToken.js
 *
 * Validates the Firebase ID token from the Authorization: Bearer <token> header.
 *
 * TWO EXPORTED MIDDLEWARES — use the right one per route:
 *
 *   verifyToken          checkRevoked = false  (default)
 *     → Use on all regular user routes (songs, search, playlists, liked songs).
 *     → Fast — no extra Firebase network call.
 *     → Tradeoff: a revoked token still works until it expires (~60 min).
 *     → Acceptable for read/write of personal data.
 *
 *   verifyTokenStrict    checkRevoked = true
 *     → Use on all admin routes and any destructive/sensitive operations.
 *     → Adds ~50–100 ms per request for the revocation check network call.
 *     → Ensures a banned or de-privileged admin loses access immediately.
 *     → Required for: admin song CRUD, user management, bulk upload.
 *
 * USAGE in route files:
 *   const { verifyToken, verifyTokenStrict } = require('../middleware/verifyToken');
 *
 *   // Regular user route
 *   router.get('/songs', verifyToken, songsController.list);
 *
 *   // Admin route — always use strict
 *   router.post('/songs', verifyTokenStrict, isAdmin, upload, songController.create);
 *
 * If checkRevoked ever needs to change globally, change ONLY the DEFAULT_CHECK_REVOKED
 * constant below — do not edit the two exported functions.
 */

const { admin } = require('../config/firebase');
const { sendError } = require('../utils/apiResponse');

// ─── Core verify logic ────────────────────────────────────────────────────────

const _verify = async (req, res, next, checkRevoked) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return sendError(res, 'No token provided', 401, 'NO_TOKEN');
  }

  const token = authHeader.split('Bearer ')[1]?.trim();

  if (!token || token === 'undefined' || token === 'null') {
    return sendError(res, 'Invalid token format', 401, 'TOKEN_INVALID_FORMAT');
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token, checkRevoked);
    req.user = decoded;
    return next();
  } catch (err) {
    return _handleTokenError(err, res);
  }
};

// ─── Error handler ────────────────────────────────────────────────────────────

function _handleTokenError(err, res) {
  const code = err.code || '';

  if (code === 'auth/id-token-expired') {
    return sendError(res, 'Token expired', 401, 'TOKEN_EXPIRED');
  }
  if (code === 'auth/id-token-revoked') {
    return sendError(res, 'Token revoked — please sign in again', 401, 'TOKEN_REVOKED');
  }
  if (code === 'auth/user-disabled') {
    return sendError(res, 'Account disabled', 403, 'USER_DISABLED');
  }
  if (code === 'auth/argument-error' || code === 'auth/invalid-id-token') {
    return sendError(res, 'Malformed token', 401, 'TOKEN_MALFORMED');
  }
  if (code === 'auth/invalid-credential') {
    return sendError(res, 'Token credential invalid', 401, 'TOKEN_CREDENTIAL_INVALID');
  }

  console.error('[verifyToken] Unexpected error:', code, err.message);
  return sendError(res, 'Token verification failed', 401, code || 'TOKEN_UNKNOWN_ERROR');
}

// ─── Exported middlewares ─────────────────────────────────────────────────────

/**
 * Standard middleware — checkRevoked: false.
 * Use on all regular (non-admin, non-destructive) protected routes.
 */
const verifyToken = (req, res, next) => _verify(req, res, next, false);

/**
 * Strict middleware — checkRevoked: true.
 * Use on all admin routes and any endpoint that mutates or deletes data.
 * Adds ~50–100 ms latency for the Firebase revocation network call.
 */
const verifyTokenStrict = (req, res, next) => _verify(req, res, next, true);

module.exports = verifyToken;
module.exports.verifyToken = verifyToken;
module.exports.verifyTokenStrict = verifyTokenStrict;