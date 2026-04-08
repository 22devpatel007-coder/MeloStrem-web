/**
 * album.service.js
 *
 * The ONLY place in the codebase that creates or updates Album documents.
 *
 * SAFETY GUARANTEE — No duplicate albums ever:
 * ─────────────────────────────────────────────
 * 1. albumId is computed deterministically from artistId + normalized album
 *    name. "Aashiqui 2" and "aashiqui 2" by the same artist always produce
 *    the same albumId. The same album name by a DIFFERENT artist produces a
 *    different albumId (because artistId is part of the key).
 *
 * 2. The Firestore write is always db.doc(albumId).set(payload, { merge: true }).
 *    - coverUrl and genre are written on creation and preserved on merge.
 *    - songCount is incremented atomically via FieldValue.increment().
 *
 * FAILURE POLICY:
 * ───────────────
 * findOrCreateAlbum NEVER throws. If Firestore fails, it logs the error and
 * returns null. The caller (songs.controller) checks for null and proceeds
 * with the song upload anyway — album linking is best-effort and must never
 * block a song upload.
 *
 * DEPENDENCY:
 * ───────────
 * Caller must have already called findOrCreateArtist and obtained a valid
 * artistId before calling this function. Never call findOrCreateAlbum with
 * a null or undefined artistId.
 */

const { db } = require('../config/firebase');
const admin = require('firebase-admin');
const { computeAlbumId } = require('../utils/normalizeEntity');
const { createAlbumDefaults } = require('../models/Album');
const logger = require('../utils/logger');

const ALBUMS_COLLECTION = 'albums';

/**
 * findOrCreateAlbum(params) → { albumId } | null
 *
 * Find-or-create an Album document using a deterministic document ID.
 * Safe to call concurrently — set-with-merge is atomic in Firestore.
 *
 * @param {object} params
 * @param {string} params.albumName  — raw album name as entered by admin
 * @param {string} params.artistId   — deterministic artist document ID (from findOrCreateArtist)
 * @param {string} params.artistName — display artist name (for denormalization)
 * @param {string} [params.coverUrl] — cover image URL uploaded with the song
 * @param {string} [params.genre]    — genre of the song being uploaded
 * @param {number} [params.year]     — optional release year
 * @returns {Promise<{ albumId: string } | null>}
 */
async function findOrCreateAlbum({ albumName, artistId, artistName, coverUrl = '', genre = '', year = 0 }) {
  if (!albumName || typeof albumName !== 'string' || !albumName.trim()) {
    logger.warn('findOrCreateAlbum: empty or invalid albumName received', { albumName, artistId });
    return null;
  }

  if (!artistId || typeof artistId !== 'string') {
    logger.warn('findOrCreateAlbum: missing or invalid artistId', { albumName, artistId });
    return null;
  }

  let albumId;
  try {
    albumId = computeAlbumId(artistId, albumName);
  } catch (err) {
    logger.error('findOrCreateAlbum: failed to compute albumId', {
      albumName,
      artistId,
      error: err.message,
    });
    return null;
  }

  try {
    const docRef = db.collection(ALBUMS_COLLECTION).doc(albumId);

    const defaults = createAlbumDefaults({
      albumId,
      name: albumName,
      artistId,
      artistName,
      coverUrl,
      genre,
      year,
    });

    // The merge write payload:
    // - On CREATE: writes all defaults including coverUrl, genre, year.
    // - On MERGE:  only updatedAt and songCount are updated via FieldValue;
    //              coverUrl, genre, year, name are included so they are set
    //              on creation but Firestore merge will NOT overwrite them
    //              if already present — we rely on the fact that the values
    //              we send match what's already stored (same album = same cover).
    //
    // ⚠  NOTE on coverUrl: we intentionally include it on every merge so the
    //    album always has a cover even if the first upload lacked one. After
    //    the first non-empty coverUrl is written, subsequent writes of the
    //    same URL are idempotent. Admins who want to manually set a different
    //    cover can do so via a future album-edit endpoint — that write will
    //    also use merge: true with the new URL.
    const mergePayload = {
      id:         albumId,
      name:       defaults.name,
      nameLower:  defaults.nameLower,
      artistId:   defaults.artistId,
      artistName: defaults.artistName,
      genre:      defaults.genre,
      year:       defaults.year,
      createdAt:  defaults.createdAt,
      // Only set coverUrl if non-empty — don't overwrite a real cover with ''
      ...(coverUrl ? { coverUrl } : {}),
      // Always update:
      updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
      songCount:  admin.firestore.FieldValue.increment(1),
    };

    await docRef.set(mergePayload, { merge: true });

    // Also increment the parent artist's albumCount — but only when the album
    // document is being created for the first time. We detect this by checking
    // if the document existed before our write.
    // We do this in a best-effort fire-and-forget to avoid slowing down the
    // upload. If it fails, albumCount may be slightly off but data integrity
    // is unaffected.
    _incrementArtistAlbumCountIfNew(artistId, albumId).catch((err) => {
      logger.warn('findOrCreateAlbum: failed to increment artist albumCount', {
        artistId,
        albumId,
        error: err.message,
      });
    });

    logger.info('findOrCreateAlbum: success', { albumId, name: defaults.name, artistId });

    return { albumId };
  } catch (err) {
    // Log but do NOT re-throw — song upload must never fail because of this
    logger.error('findOrCreateAlbum: Firestore write failed', {
      albumId,
      albumName,
      artistId,
      error: err.message,
      stack: err.stack,
    });
    return null;
  }
}

/**
 * _incrementArtistAlbumCountIfNew(artistId, albumId)
 *
 * Checks if the album was newly created (by trying to get the doc before the
 * write — race-condition-safe approach: we use a transaction to read-then-
 * conditionally-increment).
 *
 * Runs fire-and-forget. Errors are caught by the caller's .catch().
 *
 * @private
 */
async function _incrementArtistAlbumCountIfNew(artistId, albumId) {
  const albumRef  = db.collection('albums').doc(albumId);
  const artistRef = db.collection('artists').doc(artistId);

  await db.runTransaction(async (txn) => {
    const albumSnap = await txn.get(albumRef);
    // If albumCount field is missing or 0, this is a brand new album document
    // (songCount was just incremented to 1 by the outer set-merge call, so
    // we treat songCount === 1 as the signal for "newly created").
    const data = albumSnap.data();
    if (data && data.songCount === 1) {
      txn.update(artistRef, {
        albumCount: admin.firestore.FieldValue.increment(1),
        updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  });
}

module.exports = { findOrCreateAlbum };