const { db } = require('../config/firebase');

// Format a Firestore document
const formatDoc = (doc) => {
  const data = doc.data();
  return {
    id: doc.id,
    ...data,
    createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt ?? null,
    updatedAt: data.updatedAt?.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt ?? null,
  };
};

// -- Songs --

const getSongs = async (limit = 30, cursor = null) => {
  let query = db.collection('songs').orderBy('createdAt', 'desc').limit(limit);
  if (cursor) {
    const cursorDoc = await db.collection('songs').doc(cursor).get();
    if (cursorDoc.exists) query = query.startAfter(cursorDoc);
  }
  const snapshot = await query.get();
  const songs = snapshot.docs.map(formatDoc);
  const lastDoc = snapshot.docs[snapshot.docs.length - 1];
  
  return {
    songs,
    nextCursor: snapshot.docs.length === limit && lastDoc ? lastDoc.id : null,
    hasMore: snapshot.docs.length === limit,
  };
};

const getSongById = async (id) => {
  const doc = await db.collection('songs').doc(id).get();
  if (!doc.exists) return null;
  return formatDoc(doc);
};

const createSong = async (data) => {
  const docRef = await db.collection('songs').add(data);
  return { id: docRef.id, ...data };
};

const updateSong = async (id, data) => {
  await db.collection('songs').doc(id).update(data);
  return { id, ...data };
};

const deleteSong = async (id) => {
  await db.collection('songs').doc(id).delete();
  return true;
};

const searchSongs = async (term, limit = 20) => {
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
  titleSnap.docs.forEach((doc) => resultsMap.set(doc.id, formatDoc(doc)));
  artistSnap.docs.forEach((doc) => resultsMap.set(doc.id, formatDoc(doc)));

  const combined = Array.from(resultsMap.values());
  return {
    songs: combined.slice(0, limit),
    total: combined.length,
    query: term,
  };
};

const checkDuplicateSong = async (title, artist, excludeId = null) => {
  const titleLower = title.toLowerCase();
  const artistLower = artist.toLowerCase();

  const query = db
    .collection('songs')
    .where('titleLower', '==', titleLower)
    .where('artistLower', '==', artistLower);

  const snapshot = await query.get();

  if (snapshot.empty) return null;

  if (excludeId) {
    const dups = snapshot.docs.filter((doc) => doc.id !== excludeId);
    return dups.length > 0 ? dups[0].data() : null;
  }

  return snapshot.docs[0].data();
};

// -- Users --

const getUser = async (uid) => {
  const doc = await db.collection('users').doc(uid).get();
  if (!doc.exists) return null;
  return formatDoc(doc);
};

const updateUser = async (uid, data) => {
  await db.collection('users').doc(uid).set(data, { merge: true });
  return { uid, ...data };
};

const getAllUsers = async () => {
  const snapshot = await db.collection('users').orderBy('createdAt', 'desc').get();
  return snapshot.docs.map(formatDoc);
};

// -- Playlists --

const getPlaylists = async (userId) => {
  const query = db.collection('playlists').where('createdBy', '==', userId).orderBy('createdAt', 'desc');
  const snapshot = await query.get();
  return snapshot.docs.map(formatDoc);
};

const getAllPublicPlaylists = async () => {
  const query = db.collection('playlists').where('isPublic', '==', true).orderBy('createdAt', 'desc');
  const snapshot = await query.get();
  return snapshot.docs.map(formatDoc);
};

const getPlaylistById = async (id) => {
  const doc = await db.collection('playlists').doc(id).get();
  if (!doc.exists) return null;
  return formatDoc(doc);
};

const createPlaylist = async (data) => {
  const docRef = await db.collection('playlists').add(data);
  return { id: docRef.id, ...data };
};

const updatePlaylist = async (id, data) => {
  await db.collection('playlists').doc(id).update(data);
  return { id, ...data };
};

const deletePlaylist = async (id) => {
  await db.collection('playlists').doc(id).delete();
  return true;
};

module.exports = {
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
  formatDoc
};
