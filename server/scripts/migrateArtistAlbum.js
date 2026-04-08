/**
 * server/scripts/migrateArtistAlbum.js
 *
 * One-time migration script to backfill artistId, albumId, and trackNumber
 * onto all existing Song documents in Firestore.
 *
 * IDEMPOTENT — safe to run multiple times:
 *   Songs that already have artistId set are skipped entirely.
 *   Running this script a second time produces 0 new artists, 0 new albums,
 *   0 song updates.
 *
 * USAGE:
 *   cd server && node scripts/migrateArtistAlbum.js
 *
 * OUTPUT:
 *   Console progress for every song processed.
 *   Full audit log written to: server/logs/migration-<date>.json
 *
 * SAFETY:
 *   - Only adds new fields (artistId, albumId, trackNumber).
 *   - Never modifies existing fields (title, artist, album, genre, etc.).
 *   - Uses the same findOrCreateArtist / findOrCreateAlbum services as
 *     uploadSong — guarantees identical ID computation.
 *   - All Firestore writes use set({ merge: true }) via the service layer.
 *   - Songs are processed sequentially (not concurrently) to stay within
 *     Firestore write rate limits and produce clean, ordered log output.
 *
 * BEFORE RUNNING:
 *   Ensure server/.env is populated with valid Firebase credentials.
 *   The script loads dotenv automatically.
 *
 * AFTER RUNNING:
 *   Add the required Firestore composite indexes to firestore.indexes.json
 *   (see Phase 4 instructions) before deploying the frontend artist/album pages.
 */

'use strict';

// Load env before any config modules are imported
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

// These imports trigger Firebase Admin initialization via config/firebase.js
const { db }               = require('../src/config/firebase');
const { findOrCreateArtist } = require('../src/services/artist.service');
const { findOrCreateAlbum  } = require('../src/services/album.service');

// ─── Logging setup ────────────────────────────────────────────────────────────

const logsDir = path.resolve(__dirname, '../logs');
fs.mkdirSync(logsDir, { recursive: true });

const dateStamp  = new Date().toISOString().slice(0, 10); // "2026-04-08"
const logFile    = path.join(logsDir, `migration-${dateStamp}.json`);
const auditLog   = []; // accumulated per-song results, written at end

function logLine(msg) {
  // ISO timestamp prefix so log lines are sortable
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  logLine('Migration started.');
  logLine(`Audit log will be written to: ${logFile}`);

  // ── 1. Fetch all songs ──────────────────────────────────────────────────
  logLine('Fetching all songs from Firestore...');

  const snapshot = await db.collection('songs').get();
  const allDocs  = snapshot.docs;

  logLine(`Found ${allDocs.length} total song(s).`);

  // ── 2. Filter to songs that need migration ──────────────────────────────
  // A song is considered already migrated if it has artistId set (non-null,
  // non-empty string). We skip these entirely for idempotency.
  const toMigrate = allDocs.filter((doc) => {
    const data = doc.data();
    return !data.artistId || typeof data.artistId !== 'string' || !data.artistId.trim();
  });

  const alreadyDone = allDocs.length - toMigrate.length;

  logLine(`${alreadyDone} song(s) already migrated (skipping).`);
  logLine(`${toMigrate.length} song(s) to process.`);

  if (toMigrate.length === 0) {
    logLine('Nothing to do. Migration is already complete.');
    await writeAuditLog([]);
    return;
  }

  // ── 3. Track counters ───────────────────────────────────────────────────
  let successCount    = 0;
  let skipCount       = 0;
  let errorCount      = 0;
  const artistsSeen   = new Set(); // track unique artistIds created this run
  const albumsSeen    = new Set(); // track unique albumIds created this run

  // ── 4. Process each song sequentially ──────────────────────────────────
  // Sequential (not Promise.all) to:
  //   a) Stay within Firestore write rate limits on large collections
  //   b) Produce clean, ordered log output
  //   c) Make it easier to resume if the script is interrupted mid-run
  for (let i = 0; i < toMigrate.length; i++) {
    const doc  = toMigrate[i];
    const data = doc.data();
    const songId = doc.id;

    const displayTitle  = data.title  || '(no title)';
    const displayArtist = data.artist || '(no artist)';
    const displayAlbum  = data.album  || '';

    logLine(`[${i + 1}/${toMigrate.length}] Processing: "${displayTitle}" by "${displayArtist}"...`);

    const entry = {
      songId,
      title:    displayTitle,
      artist:   displayArtist,
      album:    displayAlbum,
      artistId: null,
      albumId:  null,
      status:   'pending',
      error:    null,
    };

    try {
      // Guard: skip songs with no artist string (shouldn't happen in practice)
      if (!data.artist || !String(data.artist).trim()) {
        logLine(`  ⚠  Skipping — no artist field on song ${songId}`);
        entry.status = 'skipped_no_artist';
        skipCount++;
        auditLog.push(entry);
        continue;
      }

      // ── Artist find-or-create ─────────────────────────────────────────
      const artistResult = await findOrCreateArtist(data.artist);

      if (!artistResult) {
        logLine(`  ✗  Artist service failed for "${displayArtist}" — skipping song`);
        entry.status = 'error_artist_service';
        entry.error  = 'findOrCreateArtist returned null';
        errorCount++;
        auditLog.push(entry);
        continue;
      }

      entry.artistId = artistResult.artistId;

      if (!artistsSeen.has(artistResult.artistId)) {
        artistsSeen.add(artistResult.artistId);
        logLine(`  ✓  Artist: ${artistResult.artistId}`);
      } else {
        logLine(`  ✓  Artist: ${artistResult.artistId} (existing)`);
      }

      // ── Album find-or-create (optional — only when album field exists) ─
      let albumId = null;

      if (data.album && String(data.album).trim()) {
        const albumResult = await findOrCreateAlbum({
          albumName:  String(data.album).trim(),
          artistId:   artistResult.artistId,
          artistName: artistResult.artistName,
          coverUrl:   data.coverUrl   || '',
          genre:      data.genre      || '',
          year:       0,
        });

        if (albumResult) {
          albumId = albumResult.albumId;
          entry.albumId = albumId;

          if (!albumsSeen.has(albumId)) {
            albumsSeen.add(albumId);
            logLine(`  ✓  Album:  ${albumId}`);
          } else {
            logLine(`  ✓  Album:  ${albumId} (existing)`);
          }
        } else {
          logLine(`  ⚠  Album service failed for "${displayAlbum}" — song will link to artist only`);
        }
      } else {
        logLine(`  –  No album field — skipping album link`);
      }

      // ── Update song document ──────────────────────────────────────────
      // Only write the new fields — never touch existing fields.
      const songUpdates = {
        artistId:    artistResult.artistId,
        albumId:     albumId,           // null if no album or album service failed
        trackNumber: data.trackNumber ?? null, // preserve if already set
        updatedAt:   new Date(),
      };

      await db.collection('songs').doc(songId).update(songUpdates);

      logLine(`  ✓  Song updated.`);
      entry.status = 'success';
      successCount++;

    } catch (err) {
      logLine(`  ✗  Unexpected error for song ${songId}: ${err.message}`);
      entry.status = 'error_unexpected';
      entry.error  = err.message;
      errorCount++;
    }

    auditLog.push(entry);
  } // end for loop

  // ── 5. Summary ──────────────────────────────────────────────────────────
  logLine('');
  logLine('─────────────────────────────────────────');
  logLine('Migration complete.');
  logLine(`  Songs processed : ${toMigrate.length}`);
  logLine(`  ✓  Success      : ${successCount}`);
  logLine(`  ⚠  Skipped      : ${skipCount}`);
  logLine(`  ✗  Errors       : ${errorCount}`);
  logLine(`  Artists touched : ${artistsSeen.size}`);
  logLine(`  Albums touched  : ${albumsSeen.size}`);
  logLine('─────────────────────────────────────────');

  await writeAuditLog(auditLog);
  logLine(`Full audit log written to: ${logFile}`);

  // Exit with non-zero code if any songs errored — useful for CI/CD pipelines
  if (errorCount > 0) {
    logLine(`⚠  ${errorCount} error(s) occurred. Review the audit log before proceeding.`);
    process.exit(1);
  }

  process.exit(0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog(entries) {
  const payload = {
    runAt:       new Date().toISOString(),
    totalEntries: entries.length,
    entries,
  };
  fs.writeFileSync(logFile, JSON.stringify(payload, null, 2), 'utf8');
}

// ─── Entry point ──────────────────────────────────────────────────────────────

main().catch((err) => {
  console.error('[migration] Fatal error:', err.message, err.stack);
  process.exit(1);
});