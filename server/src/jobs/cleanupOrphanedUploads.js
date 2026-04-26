'use strict';

const cloudinary = require('../config/cloudinary');
const { db }     = require('../config/firebase');
const logger     = require('../utils/logger');

const FOLDERS = ['melostream/songs', 'melostream/covers', 'melostream/playlist-covers'];

/**
 * listCloudinaryAssets(folder, resourceType) → string[]
 * Returns all public_ids in a Cloudinary folder.
 */
async function listCloudinaryAssets(folder, resourceType = 'video') {
  const assets = [];
  let nextCursor = null;

  do {
    const params = { type: 'upload', prefix: folder, max_results: 500, resource_type: resourceType };
    if (nextCursor) params.next_cursor = nextCursor;

    const result = await cloudinary.api.resources(params);
    result.resources.forEach((r) => assets.push(r.public_id));
    nextCursor = result.next_cursor || null;
  } while (nextCursor);

  return assets;
}

/**
 * getFirestoreStoragePaths() → Set<string>
 * Fetches all storagePath and coverStoragePath values from Firestore songs collection.
 */
async function getFirestoreStoragePaths() {
  const paths = new Set();
  let lastDoc = null;

  do {
    let query = db.collection('songs').select('storagePath', 'coverStoragePath').limit(500);
    if (lastDoc) query = query.startAfter(lastDoc);

    const snap = await query.get();
    if (snap.empty) break;

    snap.docs.forEach((doc) => {
      const d = doc.data();
      if (d.storagePath)      paths.add(d.storagePath);
      if (d.coverStoragePath) paths.add(d.coverStoragePath);
    });

    lastDoc = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < 500) break;
  } while (true);

  // Also collect playlist cover paths
  const playlistSnap = await db.collection('playlists').select('coverStoragePath').get();
  playlistSnap.docs.forEach((doc) => {
    const p = doc.data().coverStoragePath;
    if (p) paths.add(p);
  });

  return paths;
}

/**
 * cleanupOrphanedUploads() — main reconciliation job.
 * Safe to run at any time — read-only Firestore, destructive only on Cloudinary orphans.
 */
const cleanupOrphanedUploads = async () => {
  logger.info('[cleanupOrphanedUploads] Starting orphan reconciliation...');

  try {
    const firestorePaths = await getFirestoreStoragePaths();

    const [audioAssets, coverAssets, playlistCoverAssets] = await Promise.all([
      listCloudinaryAssets('melostream/songs',            'video'),
      listCloudinaryAssets('melostream/covers',           'image'),
      listCloudinaryAssets('melostream/playlist-covers',  'image'),
    ]);

    const allAssets = [
      ...audioAssets.map((id) => ({ id, resourceType: 'video' })),
      ...coverAssets.map((id) => ({ id, resourceType: 'image' })),
      ...playlistCoverAssets.map((id) => ({ id, resourceType: 'image' })),
    ];

    const orphans = allAssets.filter(({ id }) => !firestorePaths.has(id));

    logger.info(`[cleanupOrphanedUploads] Found ${orphans.length} orphaned asset(s) out of ${allAssets.length} total.`);

    let deleted = 0;
    let failed  = 0;

    for (const { id, resourceType } of orphans) {
      try {
        await cloudinary.uploader.destroy(id, { resource_type: resourceType });
        logger.info(`[cleanupOrphanedUploads] Deleted orphan: ${id}`);
        deleted++;
      } catch (err) {
        logger.warn(`[cleanupOrphanedUploads] Failed to delete orphan ${id}:`, { error: err.message });
        failed++;
      }
    }

    logger.info(`[cleanupOrphanedUploads] Done. deleted=${deleted} failed=${failed}`);
  } catch (err) {
    logger.error('[cleanupOrphanedUploads] Job failed:', { error: err.message });
  }
};

module.exports = { cleanupOrphanedUploads };