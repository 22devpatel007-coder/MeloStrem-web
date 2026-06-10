/**
 * server/src/controllers/auth.controller.js
 *
 * PHASE 1 — TASK 1.1 changes:
 *   - NotFoundError replaces inline res.status(404).json().
 *   - catch block no longer sends err.message to the client (was leaking
 *     internal Firebase error strings to users in the original file).
 *   - Success response (res.json with uid + user data): untouched.
 */

'use strict';

const { getUser } = require('../services/firebase.service');
const logger       = require('../utils/logger');
const { NotFoundError, InternalError } = require('../errors');
const activity = require('../services/activityLogger');

exports.verifyUser = async (req, res, next) => {
  try {
    let user = await getUser(req.user.uid);

if (!user) {
  // First-time login (Google OAuth or any provider) — create Firestore record
  const { uid, email, name, picture } = req.user;
  const { User } = require('../models/User');
  await require('../services/firebase.service').createUser(
    User.toFirestore({
      uid,
      email:       email   ?? '',
      displayName: name    ?? '',
      photoURL:    picture ?? null,
      likedSongs:  [],
      createdAt:   new Date(),
    }, 'create')
  );
}
    activity.user_login(req, { uid: req.user.uid });
    return res.json({ uid: req.user.uid, ...user });
  } catch (err) {
    if (err.isOperational !== undefined) return next(err);
    logger.error('verifyUser unexpected error:', { error: err.message, uid: req.user?.uid });
    return next(new InternalError('Something went wrong. Please try again.', 'INTERNAL_ERROR', { originalError: err.message }));
  }
};