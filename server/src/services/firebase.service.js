/**
 * server/src/services/firebase.service.js
 *
 * PERMANENT FIX — ECONNRESET / socket hang up / TLS disconnected errors
 * ─────────────────────────────────────────────────────────────────────────────
 * (original fix preserved — see full root-cause analysis in git history)
 * Every Firestore call is wrapped in retryFirestore() with exponential backoff.
 *
 * PHASE 3 — TASK 3.3: Zero Full-Collection Scans
 * ─────────────────────────────────────────────────────────────────────────────
 * Changes from previous version (ONLY query limit caps added):
 *
 *   getSongs          — internal MAX_SONGS_LIMIT cap (50) enforced inside the
 *                       function. Callers are already capped at the controller,
 *                       but defence-in-depth prevents a future caller from
 *                       accidentally bypassing the controller and fetching
 *                       unbounded rows.
 *
 *   searchSongs       — internal MAX_SEARCH_LIMIT cap (50) enforced. Each of
 *                       the two parallel queries (titleSnap + artistSnap) is
 *                       individually capped. The merge + slice logic is unchanged.
 *
 *   checkDuplicateSong — added .limit(2). We only need to know whether at least
 *                        one duplicate exists; reading the whole matching set is
 *                        wasteful and unbounded if data is malformed.
 *
 *   getAllUsers        — added .limit(MAX_USERS_LIMIT = 500). Admin-only but
 *                        still a full-collection scan. At 1000+ users this
 *                        returns all docs in one shot — capping prevents memory
 *                        exhaustion. 500 is generous for any real admin UI.
 *
 *   getPlaylists       — added .limit(MAX_PLAYLISTS_LIMIT = 200). Per-user
 *                        query but unbounded. A user theoretically has no upper
 *                        bound on playlists; 200 is a safe operational cap.
 *
 *   getAllPublicPlaylists — added .limit(MAX_PUBLIC_PLAYLISTS_LIMIT = 100).
 *                          Unused by current controllers but exported — closing
 *                          the gap prevents a future caller from scanning the
 *                          entire playlists collection.
 *
 * Unchanged from previous version:
 *   - All function signatures and return shapes: identical.
 *   - retryFirestore wrapping: identical.
 *   - formatDoc helper: untouched.
 *   - getSongById, createSong, updateSong, deleteSong: untouched (single-doc ops).
 *   - getUser, updateUser: untouched (single-doc ops).
 *   - getPlaylistById, createPlaylist, updatePlaylist, deletePlaylist: untouched.
 *   - All exports: identical.
 *
 * Query cap constants:
 *   MAX_SONGS_LIMIT            =  50  (matches controller + route cap)
 *   MAX_SEARCH_LIMIT           =  50  (matches search controller cap)
 *   MAX_USERS_LIMIT            = 500  (admin UI; users collection is bounded)
 *   MAX_PLAYLISTS_LIMIT        = 200  (per-user playlist list)
 *   MAX_PUBLIC_PLAYLISTS_LIMIT = 100  (public admin playlist browse)
 */

'use strict';

const { db }             = require('../config/firebase');
const { retryFirestore } = require('../utils/retryFirestore');

// ── Query limit caps ──────────────────────────────────────────────────────────
// Centralised here so every function enforces the same policy.
// If limits need to change, update only these constants.
//
// Firestore rule: a query without .limit() on a growing collection will
// eventually return ALL documents — at 10,000 songs that is ~20 MB per
// request. These caps are the last line of defence before the Firestore SDK.
const MAX_SONGS_LIMIT            =  50;  // songs list and artist songs pagination
const MAX_SEARCH_LIMIT           =  50;  // per-query cap (two queries run in parallel)
const MAX_USERS_LIMIT            = 500;  // admin user list — generous for any real admin UI
const MAX_PLAYLISTS_LIMIT        = 200;  // per-user playlist list
const MAX_PUBLIC_PLAYLISTS_LIMIT = 100;  // public admin playlist browse

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
  // Task 3.3: enforce server-side cap regardless of what the caller passes.
  // songs.controller already caps at 50, but defence-in-depth means this
  // function can never be the source of an unbounded query — even if called
  // directly in a future repository layer without going through the controller.
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 30), MAX_SONGS_LIMIT);

  return retryFirestore(async () => {
    let query = db.collection('songs').orderBy('createdAt', 'desc').limit(safeLimit);
    if (cursor) {
      const cursorDoc = await db.collection('songs').doc(cursor).get();
      if (cursorDoc.exists) query = query.startAfter(cursorDoc);
    }
    const snapshot = await query.get();
    const songs    = snapshot.docs.map(formatDoc);
    const lastDoc  = snapshot.docs[snapshot.docs.length - 1];

    return {
      songs,
      // hasMore: we fetched exactly safeLimit docs — there may be more.
      // If fewer than safeLimit came back, we are at the end of the collection.
      nextCursor: snapshot.docs.length === safeLimit && lastDoc ? lastDoc.id : null,
      hasMore:    snapshot.docs.length === safeLimit,
    };
  }, { label: 'getSongs' });
};

const getSongById = async (id) => {
  // Single doc fetch — no limit needed. Unchanged.
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
  // Task 3.3: cap both parallel queries internally.
  // Each query is capped at MAX_SEARCH_LIMIT independently. The merged result
  // can be up to 2×safeLimit before the final slice — still bounded.
  const safeLimit = Math.min(Math.max(1, parseInt(limit) || 20), MAX_SEARCH_LIMIT);

  return retryFirestore(async () => {
    const queryLower = term.toLowerCase();

    const [titleSnap, artistSnap] = await Promise.all([
      db.collection('songs')
        .where('titleLower', '>=', queryLower)
        .where('titleLower', '<=', queryLower + '\uf8ff')
        .limit(safeLimit)  // Task 3.3: was `limit`, now `safeLimit`
        .get(),
      db.collection('songs')
        .where('artistLower', '>=', queryLower)
        .where('artistLower', '<=', queryLower + '\uf8ff')
        .limit(safeLimit)  // Task 3.3: was `limit`, now `safeLimit`
        .get(),
    ]);

    const resultsMap = new Map();
    titleSnap.docs.forEach((doc)  => resultsMap.set(doc.id, formatDoc(doc)));
    artistSnap.docs.forEach((doc) => resultsMap.set(doc.id, formatDoc(doc)));

    const combined = Array.from(resultsMap.values());
    return {
      songs: combined.slice(0, safeLimit),  // final output capped to safeLimit
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
      .where('titleLower',  '==', titleLower)
      .where('artistLower', '==', artistLower)
      .limit(2)  // Task 3.3: we only need to know IF a duplicate exists.
                 // .limit(2) returns the match + one extra for excludeId filtering.
                 // No reason to read all matching docs — in a healthy dataset
                 // there should be 0 or 1; limit(2) covers both cases safely.
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
  // Single doc fetch — no limit needed. Unchanged.
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
  // Task 3.3: was a full collection scan — no limit at all.
  // At 1000+ users, returning every user doc in one query risks:
  //   - 1000+ Firestore reads billed in a single request
  //   - ~500 KB+ response payload for a UI that shows paginated rows
  //   - Memory pressure if the admin page is opened by multiple admins
  // 500 is generous enough for any real admin user management UI today.
  // When the user base exceeds 500, the admin UI needs cursor pagination —
  // at that point replace this with a paginated getAllUsers(limit, cursor).
  return retryFirestore(async () => {
    const snapshot = await db
      .collection('users')
      .orderBy('createdAt', 'desc')
      .limit(MAX_USERS_LIMIT)  // Task 3.3: was .get() with no limit
      .get();
    return snapshot.docs.map(formatDoc);
  }, { label: 'getAllUsers' });
};

// ══════════════════════════════════════════════════════════════════════════════
// PLAYLISTS
// ══════════════════════════════════════════════════════════════════════════════

const getPlaylists = async (userId) => {
  // Task 3.3: added .limit(MAX_PLAYLISTS_LIMIT).
  // Per-user query but theoretically unbounded. 200 is a safe operational cap
  // — a user with more than 200 playlists is well outside normal usage patterns
  // and would indicate either abuse or a need for cursor pagination.
  return retryFirestore(async () => {
    const snapshot = await db
      .collection('playlists')
      .where('createdBy', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(MAX_PLAYLISTS_LIMIT)  // Task 3.3: was .get() with no limit
      .get();
    return snapshot.docs.map(formatDoc);
  }, { label: 'getPlaylists' });
};

const getAllPublicPlaylists = async () => {
  // Task 3.3: added .limit(MAX_PUBLIC_PLAYLISTS_LIMIT).
  // This function is currently unused by controllers (playlists.controller
  // queries Firestore directly), but it is exported and could be called by
  // future code. Without a limit it would scan ALL public playlists.
  return retryFirestore(async () => {
    const snapshot = await db
      .collection('playlists')
      .where('isPublic', '==', true)
      .orderBy('createdAt', 'desc')
      .limit(MAX_PUBLIC_PLAYLISTS_LIMIT)  // Task 3.3: was .get() with no limit
      .get();
    return snapshot.docs.map(formatDoc);
  }, { label: 'getAllPublicPlaylists' });
};

const getPlaylistById = async (id) => {
  // Single doc fetch — no limit needed. Unchanged.
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