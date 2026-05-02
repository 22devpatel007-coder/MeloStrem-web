/**
 * server/src/models/User.js
 *
 * Phase 2 — Task 2.2: Model Transformation Layer
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Owns ALL User data transformation between Firestore and the API layer.
 *
 * Integration contract with BaseRepository:
 *   UserRepository calls BaseRepository.formatDoc() which converts Timestamps
 *   to ISO strings. User.fromFirestore() receives that plain object and applies
 *   defensive defaults for every field.
 *
 * Field inventory (mirrors UserSchema):
 *   uid, email, displayName, role, likedSongs (array of songIds), createdAt
 *
 * SECURITY — what NOT to expose:
 *   - Firebase ID tokens: never stored in Firestore, never in fromFirestore output.
 *   - Raw admin claim: req.user.admin (from Firebase custom claims) is the source
 *     of truth for admin status — it is NOT derived from the Firestore role field
 *     at the authorization layer. The role field is for display/audit only.
 *   - likedSongs: returned in GET /api/users/:uid/liked-songs responses only,
 *     not in general user profile reads. The controller decides what to include.
 *
 * likedSongs field:
 *   Stored as an array of song document IDs (strings).
 *   Full song objects are resolved separately via GET /api/users/:uid/liked-songs
 *   which fetches each song from Firestore. Not embedded in the User document.
 *   fromFirestore() always returns likedSongs as a clean string[] with no nulls.
 *
 * updatedAt is intentionally absent from UserSchema:
 *   The original schema only has createdAt. updatedAt is not tracked on user
 *   documents — liked songs changes use FieldValue.arrayUnion/arrayRemove which
 *   don't need a separate timestamp update. fromFirestore() safely handles its
 *   absence (returns null).
 */

'use strict';

const { FieldValue } = require('firebase-admin/firestore');

const ROLES = Object.freeze({ USER: 'user', ADMIN: 'admin' });

class User {
  /**
   * fromFirestore(data) → plain User object
   *
   * Accepts the plain object from BaseRepository.formatDoc().
   * Never throws — all fields have safe defaults.
   *
   * @param {object} data — plain object from BaseRepository.formatDoc()
   * @returns {object}    — clean, serializable User (safe for API responses)
   */
  static fromFirestore(data) {
    if (!data || typeof data !== 'object') {
      return User._empty();
    }

    // likedSongs: filter out nulls/non-strings defensively
    const likedSongs = Array.isArray(data.likedSongs)
      ? data.likedSongs.filter((id) => typeof id === 'string' && id.trim() !== '')
      : [];

    // Normalize role — only accept known role values, default to USER
    const rawRole = typeof data.role === 'string' ? data.role.toLowerCase() : '';
    const role = Object.values(ROLES).includes(rawRole) ? rawRole : ROLES.USER;

    return {
      // User documents use uid as the document ID, not an auto-generated id.
      // BaseRepository.formatDoc() puts snap.id into the `id` field.
      // We expose it as both `id` and `uid` for backward compatibility.
      id:          typeof data.id          === 'string' ? data.id               : (data.uid || ''),
      uid:         typeof data.uid         === 'string' ? data.uid              : (data.id  || ''),
      email:       typeof data.email       === 'string' ? data.email.trim()     : '',
      displayName: typeof data.displayName === 'string' ? data.displayName.trim(): '',
      role,
      likedSongs,
      photoURL:    typeof data.photoURL === 'string' ? data.photoURL.trim() : null,

      // Timestamps — already ISO strings from BaseRepository.formatDoc()
      createdAt:   data.createdAt ?? null,
      // updatedAt is not in UserSchema but handle gracefully if present
      updatedAt:   data.updatedAt ?? null,
    };
  }

  /**
   * toFirestore(data, mode) → object ready to write to Firestore
   *
   * mode = 'create' : full document write (new user on first sign-in).
   * mode = 'update' : partial update — only include fields in data.
   *                   likedSongs mutations (like/unlike) use FieldValue.arrayUnion/
   *                   arrayRemove in the controller/service — they bypass this
   *                   method intentionally. Only use 'update' mode for profile
   *                   field changes (displayName, email).
   *
   * NEVER writes Firebase custom claims (admin flag) — those are managed
   * exclusively via Firebase Admin SDK setCustomUserClaims() in setAdminClaim.js.
   *
   * @param {object} data
   * @param {'create'|'update'} [mode='create']
   * @returns {object}
   */
  static toFirestore(data, mode = 'create') {
    if (mode === 'update') {
      const payload = {};
      // Only update fields that are explicitly provided
      if (data.email       !== undefined) payload.email       = String(data.email).trim();
      if (data.displayName !== undefined) payload.displayName = String(data.displayName).trim();
      // role changes via toFirestore are intentionally blocked — use setAdminClaim.js
      // for admin promotion; regular role changes should be explicit admin operations.
      return payload;
    }

    // mode === 'create' — written on first sign-in (auth.controller.js)
    const likedSongs = Array.isArray(data.likedSongs)
      ? data.likedSongs.filter((id) => typeof id === 'string' && id.trim() !== '')
      : [];

    return {
      uid:         typeof data.uid         === 'string' ? data.uid.trim()          : '',
      email:       typeof data.email       === 'string' ? data.email.trim()        : '',
      displayName: typeof data.displayName === 'string' ? data.displayName.trim()  : '',
      photoURL:    typeof data.photoURL    === 'string' ? data.photoURL.trim()     : null,
      role:        ROLES.USER,   // always USER on creation — admin via custom claims only
      likedSongs,
      createdAt:   data.createdAt instanceof Date
        ? data.createdAt
        : FieldValue.serverTimestamp(),
    };
  }

  /**
   * toPublicProfile(data) → safe public-facing User object
   *
   * Strips likedSongs and other private fields for responses that should
   * not expose the user's library. Used by UsersList admin view.
   *
   * @param {object} data — result of fromFirestore()
   * @returns {object}
   */
  static toPublicProfile(data) {
    return {
      id:          data.id          || '',
      uid:         data.uid         || '',
      email:       data.email       || '',
      displayName: data.displayName || '',
      photoURL:    data.photoURL    ?? null,
      role:        data.role        || ROLES.USER,
      createdAt:   data.createdAt   || null,
    };
  }

  /** @private */
  static _empty() {
    return {
      id: '', uid: '', email: '', displayName: '',
      photoURL: null,
      role: ROLES.USER, likedSongs: [],
      createdAt: null, updatedAt: null,
    };
  }
  static _empty() {
    return {
      id: '', uid: '', email: '', displayName: '',
      photoURL: null,
      role: ROLES.USER, likedSongs: [],
      createdAt: null, updatedAt: null,
    };
  }
}


// ── Legacy exports — backward compatibility ────────────────────────────────────
// Existing imports of { UserSchema, ROLES, createUserDefaults } continue to work.

const UserSchema = {
  uid:         'string',
  email:       'string',
  displayName: 'string',
  role:        'string',
  createdAt:   'timestamp',
  likedSongs:  'array',
};

const createUserDefaults = () => ({
  role:      ROLES.USER,
  createdAt: new Date(),
  likedSongs:[],
});

module.exports = { User, ROLES, UserSchema, createUserDefaults };