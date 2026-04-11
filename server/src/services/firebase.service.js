/**
 * server/src/services/firebase.service.js
 *
 * PERMANENT FIX — ECONNRESET / socket hang up / TLS disconnected errors
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Root cause:
 *   Every Firestore call was a single unguarded `await db.collection(...).get()`.
 *   Render.com idles-out TCP sockets after ~10 min of inactivity.
 *   When the next request hits a dead socket, node-fetch throws ECONNRESET
 *   or "socket hang up" — and there was zero retry, so the error propagated
 *   all the way to the client as a 500.
 *
 * Fix:
 *   Every Firestore call is now wrapped in retryFirestore() which retries up
 *   to 3 times with full-jitter exponential backoff, only for transient
 *   network/transport errors. Non-transient errors (not found, bad data, etc.)
 *   are re-thrown immediately.
 *
 * No changes to function signatures, exports, or return shapes.
 * All callers (controllers, routes) remain unchanged.
 */

'use strict';

const { db }            = require('../config/firebase');
const { retryFirestore } = require('../utils/retryFirestore');

// ── formatDoc ─────────────────────────────────────────────────────────────────
const formatDoc = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
  };
};

// ══════════════════════════════════════════════════════════════════════════════
// SONGS
// ══════════════════════════════════════════════════════════════════════════════

const getSongs = async (limit = 30, cursor = null) => {
  return retryFirestore(async () => {
    let query = db.collection('songs').orderBy('createdAt', 'desc').limit(limit);
    if (cursor) {
      const cursorDoc = await db.collection('songs').doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const snapshot = await query.get();
    const songs    = snapshot.docs.map(formatDoc);
    const lastDoc  = snapshot.docs[snapshot.docs.length - 1];

    return {
      songs,
      nextCursor: snapshot.docs.length === limit && lastDoc ? lastDoc.id : null,
      hasMore:    snapshot.docs.length === limit,
    };
  }, { label: 'getSongs' });
};

const getSongById = async (id) => {
  return retryFirestore(async () => {
    const doc = await db.collection('songs').doc(id).get();
    if (!doc.exists) return null;
    return formatDoc(doc);
  }, { label: 'getSongById' });
};

const createSong = async (data) => {
  return retryFirestore(async () => {
    const docRef = await db.collection('songs').add(data);
    return { id: docRef.id, ...data };
  }, { label: 'createSong' });
};

const updateSong = async (id, data) => {
  return retryFirestore(async () => {
    await db.collection('songs').doc(id).update(data);
    return { id, ...data };
  }, { label: 'updateSong' });
};

const deleteSong = async (id) => {
  return retryFirestore(async () => {
    await db.collection('songs').doc(id).delete();
    return true;
  }, { label: 'deleteSong' });
};

const searchSongs = async (term, limit = 20) => {
  return retryFirestore(async () => {
    const queryLower = term.toLowerCase();

    const [titleSnap, artistSnap] = await Promise.all([
      db.collection('songs')
        .where('titleLower', '>=', queryLower)
        .where('titleLower', '<=', queryLower + '\uf8ff')
        .limit(limit)
        .get(),
      db.collection('songs')
        .where('artistLower', '>=', queryLower)
        .where('artistLower', '<=', queryLower + '\uf8ff')
        .limit(limit)
        .get(),
    ]);

    const resultsMap = new Map();
    titleSnap.docs.forEach((doc)  => resultsMap.set(doc.id, formatDoc(doc)));
    artistSnap.docs.forEach((doc) => resultsMap.set(doc.id, formatDoc(doc)));

    const combined = Array.from(resultsMap.values());
    return {
      songs: combined.slice(0, limit),
      total: combined.length,
      query: term,
    };
  }, { label: 'searchSongs' });
};

const checkDuplicateSong = async (title, artist, excludeId = null) => {
  return retryFirestore(async () => {
    const titleLower  = title.toLowerCase();
    const artistLower = artist.toLowerCase();

    const snapshot = await db
      .collection('songs')
      .where('titleLower', '==', titleLower)
      .where('artistLower', '==', artistLower)
      .get();

    if (snapshot.empty) return null;

    if (excludeId) {
      const dups = snapshot.docs.filter((doc) => doc.id !== excludeId);
      return dups.length > 0 ? dups[0].data() : null;
    }

    return snapshot.docs[0].data();
  }, { label: 'checkDuplicateSong' });
};

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════

const getUser = async (uid) => {
  return retryFirestore(async () => {
    const doc = await db.collection('users').doc(uid).get();
    if (!doc.exists) return null;
    return formatDoc(doc);
  }, { label: 'getUser' });
};

const updateUser = async (uid, data) => {
  return retryFirestore(async () => {
    await db.collection('users').doc(uid).set(data, { merge: true });
    return { uid, ...data };
  }, { label: 'updateUser' });
};

const getAllUsers = async () => {
  return retryFirestore(async () => {
    const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
    return snapshot.docs.map(formatDoc);
  }, { label: 'getAllUsers' });
};

// ══════════════════════════════════════════════════════════════════════════════
// PLAYLISTS
// ══════════════════════════════════════════════════════════════════════════════

const getPlaylists = async (userId) => {
  return retryFirestore(async () => {
    const snapshot = await db
      .collection('playlists')
      .where('createdBy', '==', userId)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(formatDoc);
  }, { label: 'getPlaylists' });
};

const getAllPublicPlaylists = async () => {
  return retryFirestore(async () => {
    const snapshot = await db
      .collection('playlists')
      .where('isPublic', '==', true)
      .orderBy('createdAt', 'desc')
      .get();
    return snapshot.docs.map(formatDoc);
  }, { label: 'getAllPublicPlaylists' });
};

const getPlaylistById = async (id) => {
  return retryFirestore(async () => {
    const doc = await db.collection('playlists').doc(id).get();
    if (!doc.exists) return null;
    return formatDoc(doc);
  }, { label: 'getPlaylistById' });
};

const createPlaylist = async (data) => {
  return retryFirestore(async () => {
    const docRef = await db.collection('playlists').add(data);
    return { id: docRef.id, ...data };
  }, { label: 'createPlaylist' });
};

const updatePlaylist = async (id, data) => {
  return retryFirestore(async () => {
    await db.collection('playlists').doc(id).update(data);
    return { id, ...data };
  }, { label: 'updatePlaylist' });
};

const deletePlaylist = async (id) => {
  return retryFirestore(async () => {
    await db.collection('playlists').doc(id).delete();
    return true;
  }, { label: 'deletePlaylist' });
};

module.exports = {
  formatDoc,
  getSongs,
  getSongById,
  createSong,
  updateSong,
  deleteSong,
  searchSongs,
  checkDuplicateSong,
  getUser,
  updateUser,
  getAllUsers,
  getPlaylists,
  getAllPublicPlaylists,
  getPlaylistById,
  createPlaylist,
  updatePlaylist,
  deletePlaylist,
};