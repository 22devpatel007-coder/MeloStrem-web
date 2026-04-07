/**
 * server/src/middleware/isAdmin.js
 *
 * Checks whether the authenticated user has admin privileges.
 *
 * CLAIM CONTRACT (must stay in sync with client):
 *   Server sets:   req.user.admin === true  (boolean, from Firebase custom claim)
 *   Client reads:  tokenResult.claims.admin  (same claim, same name)
 *   Script to set: scripts/setAdminClaim.js  → sets { admin: true } on the token
 *
 * ⚠️  If you change the claim name here, change it in:
 *     - client/src/hooks/useAuth.js          (tokenResult.claims.<name>)
 *     - client/src/store/authStore.js        (setAdmin call)
 *     - scripts/setAdminClaim.js             (the claim object being written)
 *
 * CHECK ORDER:
 *   1. Firebase custom claim  req.user.admin === true
 *      → Fast, zero extra I/O, source of truth in production.
 *      → Set once per admin via: node scripts/setAdminClaim.js <uid>
 *
 *   2. ADMIN_EMAILS env var
 *      → Escape hatch for initial setup before claims are provisioned.
 *      → Remove from .env once all admins have claims set.
 *
 * The Firestore role fallback has been removed.
 * Reason: it added a Firestore read on every admin request, was a second
 * source of truth that could diverge from claims, and is no longer needed
 * once setAdminClaim.js has been run for all admin users.
 * If you need to revoke admin: clear the custom claim, do NOT rely on Firestore.
 */

const config = require('../config/index');
const { sendError } = require('../utils/apiResponse');

const isAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return sendError(res, 'Not authenticated', 401, 'NOT_AUTHENTICATED');
    }

    // 1. Firebase custom claim — production path, zero extra I/O.
    //    req.user is the decoded Firebase ID token populated by verifyToken.
    //    The claim is set as { admin: true } by scripts/setAdminClaim.js.
    if (req.user.admin === true) {
      return next();
    }

    // 2. ADMIN_EMAILS env var — initial-setup escape hatch only.
    //    Once all admins have the custom claim set, clear this env var.
    const adminEmails = config.adminEmails ?? [];
    if (
      Array.isArray(adminEmails) &&
      adminEmails.length > 0 &&
      req.user.email &&
      adminEmails.includes(req.user.email.toLowerCase())
    ) {
      // Warn in production so ops knows a claim-less admin is still relying on this path.
      if (process.env.NODE_ENV === 'production') {
        console.warn(
          '[isAdmin] Admin access via ADMIN_EMAILS env var for:',
          req.user.email,
          '— run scripts/setAdminClaim.js to provision a proper claim.'
        );
      }
      return next();
    }

    // Access denied.
    console.warn('[isAdmin] Access denied for uid:', req.user.uid, 'email:', req.user.email);
    return sendError(res, 'Admin access required', 403, 'FORBIDDEN');

  } catch (err) {
    console.error('[isAdmin] Unexpected error:', err.message);
    return sendError(res, 'Server error in admin check', 500, 'INTERNAL_ERROR');
  }
};

module.exports = isAdmin;