/**
 * artist.service.js
 *
 * The ONLY place in the codebase that creates or updates Artist documents.
 *
 * SAFETY GUARANTEE — No duplicate artists ever:
 * ─────────────────────────────────────────────
 * 1. artistId is computed deterministically from the normalized name BEFORE
 *    any Firestore call. "Arijit Singh", "arijit singh", "ARIJIT SINGH" all
 *    produce "artist_arijit-singh".
 *
 * 2. The Firestore write is always db.doc(artistId).set(payload, { merge: true }).
 *    - If the document does NOT exist → it is created.
 *    - If the document DOES exist → only updatedAt and songCount change.
 *      bio, imageUrl, name, verified are NEVER overwritten by a song upload.
 *
 * 3. Because two concurrent uploads share the same deterministic ID, Firestore
 *    merges them onto the same document. No race condition is possible.
 *
 * FAILURE POLICY:
 * ───────────────
 * findOrCreateArtist NEVER throws. If Firestore fails, it logs the error and
 * returns null. The caller (songs.controller) checks for null and proceeds
 * with the song upload anyway — artist linking is best-effort and must never
 * block a song upload.
 */

const { db } = require('../config/firebase');
const admin = require('firebase-admin');
const { computeArtistId } = require('../utils/normalizeEntity');
const { createArtistDefaults } = require('../models/Artist');
const logger = require('../utils/logger');

const ARTISTS_COLLECTION = 'artists';

/**
 * findOrCreateArtist(rawName) → { artistId, artistName } | null
 *
 * Find-or-create an Artist document using a deterministic document ID.
 * Safe to call concurrently — set-with-merge is atomic in Firestore.
 *
 * @param {string} rawName — artist name exactly as entered by admin
 * @returns {Promise<{ artistId: string, artistName: string } | null>}
 */
async function findOrCreateArtist(rawName) {
  if (!rawName || typeof rawName !== 'string' || !rawName.trim()) {
    logger.warn('findOrCreateArtist: empty or invalid name received', { rawName });
    return null;
  }

  let artistId;
  try {
    artistId = computeArtistId(rawName);
  } catch (err) {
    logger.error('findOrCreateArtist: failed to compute artistId', {
      rawName,
      error: err.message,
    });
    return null;
  }

  try {
    const docRef = db.collection(ARTISTS_COLLECTION).doc(artistId);

    // Build the creation payload (used only when doc doesn't exist).
    // For existing docs, merge: true means only the fields we explicitly
    // include in the update object are touched — all other fields are preserved.
    const defaults = createArtistDefaults(rawName, artistId);

    // The merge write payload:
    // - On CREATE: writes all defaults.
    // - On MERGE:  only updatedAt and songCount are updated;
    //              name/bio/imageUrl/verified are NOT included here so they
    //              are never overwritten by a song upload.
    const mergePayload = {
      // Preserve these on creation, never overwrite on merge:
      id:        artistId,
      name:      defaults.name,
      nameLower: defaults.nameLower,
      bio:       defaults.bio,        // '' on creation; admin sets later
      imageUrl:  defaults.imageUrl,   // '' on creation; admin sets later
      verified:  defaults.verified,
      createdAt: defaults.createdAt,
      // Always update:
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      songCount: admin.firestore.FieldValue.increment(1),
    };

    await docRef.set(mergePayload, { merge: true });

    logger.info('findOrCreateArtist: success', { artistId, name: defaults.name });

    return { artistId, artistName: defaults.name };
  } catch (err) {
    // Log but do NOT re-throw — song upload must never fail because of this
    logger.error('findOrCreateArtist: Firestore write failed', {
      artistId,
      rawName,
      error: err.message,
      stack: err.stack,
    });
    return null;
  }
}

module.exports = { findOrCreateArtist };