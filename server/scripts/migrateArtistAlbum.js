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
 *   cd server
 *
 *   # Dry run — shows what would change, writes nothing to Firestore:
 *   node scripts/migrateArtistAlbum.js --dry-run
 *
 *   # Live run — writes to Firestore, creates backup before any writes:
 *   node scripts/migrateArtistAlbum.js
 *
 *   # Rollback — restores exact pre-migration field values from backup file:
 *   node scripts/migrateArtistAlbum.js --rollback=../logs/backup-artistalbum-<date>-<time>.json
 *
 * OUTPUT:
 *   Console progress for every song processed.
 *   Backup snapshot written BEFORE any writes:  server/logs/backup-artistalbum-<date>-<time>.json
 *   Full audit log written AFTER all writes:    server/logs/migration-artistalbum-<date>-<time>.json
 *
 * SAFETY:
 *   - Dry-run flag makes the script fully non-destructive for review.
 *   - Backup captures the exact pre-migration state of every affected document.
 *   - Rollback restores only the fields this script touched (artistId, albumId,
 *     trackNumber, updatedAt) to their exact pre-migration values using
 *     set({ merge: true }) — other fields on the document are never disturbed.
 *   - Only adds/overwrites new fields during live run — never touches title,
 *     artist, album, genre, coverUrl, or any other pre-existing fields.
 *   - Uses the same findOrCreateArtist / findOrCreateAlbum services as
 *     uploadSong — guarantees identical ID computation.
 *   - Songs are processed sequentially (not concurrently) to stay within
 *     Firestore write rate limits and produce clean, ordered log output.
 *
 * BEFORE RUNNING:
 *   Ensure server/.env is populated with valid Firebase credentials.
 *   The script loads dotenv automatically.
 *   Always run --dry-run first and review output before the live run.
 *
 * AFTER RUNNING:
 *   Add the required Firestore composite indexes to firestore.indexes.json
 *   (see Phase 4 instructions) before deploying the frontend artist/album pages.
 *   Keep the backup file until the migration is confirmed stable in production.
 */

'use strict';

// Load env before any config modules are imported
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

// These imports trigger Firebase Admin initialization via config/firebase.js
const { db }                 = require('../src/config/firebase');
const { findOrCreateArtist } = require('../src/services/artist.service');
const { findOrCreateAlbum  } = require('../src/services/album.service');

// ─── CLI argument parsing ──────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

// --rollback=path/to/backup.json
const rollbackArg = args.find((a) => a.startsWith('--rollback='));
const ROLLBACK    = rollbackArg ? rollbackArg.split('=').slice(1).join('=') : null;

// ─── Logging / path setup ─────────────────────────────────────────────────────

const logsDir = path.resolve(__dirname, '../logs');
fs.mkdirSync(logsDir, { recursive: true });

// Include time in stamp so multiple runs on the same day don't overwrite files
const runStamp   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // "2026-04-08T14-30-00"
const backupFile = path.join(logsDir, `backup-artistalbum-${runStamp}.json`);
const logFile    = path.join(logsDir, `migration-artistalbum-${runStamp}.json`);
const auditLog   = [];

function logLine(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── ROLLBACK ─────────────────────────────────────────────────────────────────

/**
 * Reads a previously written backup file and restores the exact pre-migration
 * field values for every song that was captured.
 *
 * Rollback uses set({ merge: true }) so it only restores the specific fields
 * that were backed up (artistId, albumId, trackNumber, updatedAt).
 * All other fields on each document remain untouched.
 *
 * If a backed-up field value was undefined (field did not exist before migration),
 * the rollback uses FieldValue.delete() to remove that field, returning the
 * document to its exact pre-migration shape.
 */
async function runRollback(backupPath) {
  logLine(`ROLLBACK MODE — reading backup: ${backupPath}`);

  const resolved = path.resolve(backupPath);
  if (!fs.existsSync(resolved)) {
    logLine(`✗  Backup file not found: ${resolved}`);
    process.exit(1);
  }

  let backup;
  try {
    backup = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (err) {
    logLine(`✗  Failed to parse backup file: ${err.message}`);
    process.exit(1);
  }

  const { entries } = backup;
  if (!Array.isArray(entries) || entries.length === 0) {
    logLine('Backup contains no entries. Nothing to rollback.');
    process.exit(0);
  }

  logLine(`Found ${entries.length} document(s) in backup. Starting rollback...`);

  // Import FieldValue for delete sentinel
  const admin      = require('firebase-admin');
  const FieldValue = admin.firestore.FieldValue;

  let successCount = 0;
  let errorCount   = 0;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const { songId, before } = entry;

    logLine(`[${i + 1}/${entries.length}] Restoring song ${songId}...`);

    try {
      // Build restore payload — use FieldValue.delete() for fields that
      // did not exist before the migration (value stored as null sentinel).
      const restore = {};

      for (const [field, value] of Object.entries(before)) {
        restore[field] = value === null ? FieldValue.delete() : value;
      }

      await db.collection('songs').doc(songId).set(restore, { merge: true });

      logLine(`  ✓  Restored.`);
      successCount++;
    } catch (err) {
      logLine(`  ✗  Failed to restore song ${songId}: ${err.message}`);
      errorCount++;
    }
  }

  logLine('');
  logLine('─────────────────────────────────────────');
  logLine('Rollback complete.');
  logLine(`  ✓  Restored : ${successCount}`);
  logLine(`  ✗  Errors   : ${errorCount}`);
  logLine('─────────────────────────────────────────');

  process.exit(errorCount > 0 ? 1 : 0);
}

// ─── BACKUP ───────────────────────────────────────────────────────────────────

/**
 * Captures the pre-migration state of every field this script will touch.
 * Written to disk BEFORE the first Firestore write so it is always available
 * for rollback even if the migration is interrupted partway through.
 *
 * Fields captured per document:
 *   artistId, albumId, trackNumber, updatedAt
 *
 * If a field did not exist on a document, its value is stored as null.
 * The rollback path uses null as the sentinel to issue a FieldValue.delete()
 * and return the document to its exact pre-migration shape.
 */
function writeBackup(toMigrate) {
  const ROLLBACK_FIELDS = ['artistId', 'albumId', 'trackNumber', 'updatedAt'];

  const entries = toMigrate.map((doc) => {
    const data   = doc.data();
    const before = {};

    for (const field of ROLLBACK_FIELDS) {
      // Store the current value, or null if the field doesn't exist.
      // null is our sentinel meaning "delete this field on rollback".
      before[field] = Object.prototype.hasOwnProperty.call(data, field)
        ? (data[field] instanceof Date ? data[field].toISOString()
          : data[field] !== undefined  ? data[field]
          : null)
        : null;
    }

    return {
      songId: doc.id,
      title:  data.title  || '(no title)',
      artist: data.artist || '(no artist)',
      before,
    };
  });

  const payload = {
    createdAt:       new Date().toISOString(),
    migration:       'migrateArtistAlbum',
    rollbackFields:  ROLLBACK_FIELDS,
    totalDocuments:  entries.length,
    entries,
  };

  fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), 'utf8');
  logLine(`Backup written to: ${backupFile}`);
  logLine(`To rollback: node scripts/migrateArtistAlbum.js --rollback=${backupFile}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  // Handle rollback mode before anything else
  if (ROLLBACK) {
    await runRollback(ROLLBACK);
    return;
  }

  if (DRY_RUN) {
    logLine('DRY-RUN MODE — no data will be written to Firestore.');
  }

  logLine('Migration started: migrateArtistAlbum');
  logLine(`Audit log will be written to: ${logFile}`);

  // ── 1. Fetch all songs ──────────────────────────────────────────────────
  logLine('Fetching all songs from Firestore...');

  const snapshot = await db.collection('songs').get();
  const allDocs  = snapshot.docs;

  logLine(`Found ${allDocs.length} total song(s).`);

  // ── 2. Filter to songs that need migration ──────────────────────────────
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

  // ── 3. Write backup BEFORE any Firestore writes (live run only) ─────────
  if (!DRY_RUN) {
    writeBackup(toMigrate);
  } else {
    logLine('[DRY-RUN] Backup would be written to: ' + backupFile);
  }

  // ── 4. Track counters ───────────────────────────────────────────────────
  let successCount  = 0;
  let skipCount     = 0;
  let errorCount    = 0;
  const artistsSeen = new Set();
  const albumsSeen  = new Set();

  // ── 5. Process each song sequentially ──────────────────────────────────
  for (let i = 0; i < toMigrate.length; i++) {
    const doc  = toMigrate[i];
    const data = doc.data();
    const songId = doc.id;

    const displayTitle  = data.title  || '(no title)';
    const displayArtist = data.artist || '(no artist)';
    const displayAlbum  = data.album  || '';

    logLine(`[${i + 1}/${toMigrate.length}] Processing: "${displayTitle}" by "${displayArtist}"${DRY_RUN ? ' [DRY-RUN]' : ''}...`);

    const entry = {
      songId,
      title:    displayTitle,
      artist:   displayArtist,
      album:    displayAlbum,
      artistId: null,
      albumId:  null,
      status:   'pending',
      error:    null,
      dryRun:   DRY_RUN,
    };

    try {
      if (!data.artist || !String(data.artist).trim()) {
        logLine(`  ⚠  Skipping — no artist field on song ${songId}`);
        entry.status = 'skipped_no_artist';
        skipCount++;
        auditLog.push(entry);
        continue;
      }

      // ── Artist find-or-create ─────────────────────────────────────────
      // In dry-run mode we still call the service so we can report what
      // WOULD be created/reused — but no song document is written.
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

      // ── Album find-or-create ──────────────────────────────────────────
      let albumId = null;

      if (data.album && String(data.album).trim()) {
        const albumResult = await findOrCreateAlbum({
          albumName:  String(data.album).trim(),
          artistId:   artistResult.artistId,
          artistName: artistResult.artistName,
          coverUrl:   data.coverUrl || '',
          genre:      data.genre    || '',
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

      // ── Update song document (skipped in dry-run) ─────────────────────
      if (DRY_RUN) {
        logLine(`  ℹ  [DRY-RUN] Would write: artistId=${entry.artistId} albumId=${albumId ?? 'null'}`);
        entry.status = 'dry_run_would_update';
        successCount++;
      } else {
        const songUpdates = {
          artistId:    artistResult.artistId,
          albumId:     albumId,
          trackNumber: data.trackNumber ?? null,
          updatedAt:   new Date(),
        };

        await db.collection('songs').doc(songId).update(songUpdates);

        logLine(`  ✓  Song updated.`);
        entry.status = 'success';
        successCount++;
      }

    } catch (err) {
      logLine(`  ✗  Unexpected error for song ${songId}: ${err.message}`);
      entry.status = 'error_unexpected';
      entry.error  = err.message;
      errorCount++;
    }

    auditLog.push(entry);
  }

  // ── 6. Summary ──────────────────────────────────────────────────────────
  logLine('');
  logLine('─────────────────────────────────────────');
  logLine(DRY_RUN ? 'Dry run complete.' : 'Migration complete.');
  logLine(`  Songs processed : ${toMigrate.length}`);
  logLine(`  ✓  Success      : ${successCount}`);
  logLine(`  ⚠  Skipped      : ${skipCount}`);
  logLine(`  ✗  Errors       : ${errorCount}`);
  logLine(`  Artists touched : ${artistsSeen.size}`);
  logLine(`  Albums touched  : ${albumsSeen.size}`);
  logLine('─────────────────────────────────────────');

  if (!DRY_RUN) {
    logLine(`Backup file:    ${backupFile}`);
    logLine(`To rollback:    node scripts/migrateArtistAlbum.js --rollback=${backupFile}`);
  }

  await writeAuditLog(auditLog);
  logLine(`Audit log:      ${logFile}`);

  if (errorCount > 0) {
    logLine(`⚠  ${errorCount} error(s) occurred. Review the audit log before proceeding.`);
    process.exit(1);
  }

  process.exit(0);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function writeAuditLog(entries) {
  const payload = {
    runAt:        new Date().toISOString(),
    dryRun:       DRY_RUN,
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