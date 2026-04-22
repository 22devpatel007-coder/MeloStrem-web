/**
 * server/scripts/migrateSearchFields.js
 *
 * One-time migration script to backfill titleLower and artistLower onto all
 * existing Song documents in Firestore. These lowercase fields power the
 * case-insensitive search queries used by the search controller.
 *
 * IDEMPOTENT — safe to run multiple times:
 *   Songs that already have both titleLower and artistLower set are skipped.
 *   Running this script a second time on a fully migrated collection produces
 *   0 writes.
 *
 * USAGE:
 *   cd server
 *
 *   # Dry run — shows what would change, writes nothing to Firestore:
 *   node scripts/migrateSearchFields.js --dry-run
 *
 *   # Live run — writes to Firestore, creates backup before any writes:
 *   node scripts/migrateSearchFields.js
 *
 *   # Rollback — restores exact pre-migration field values from backup file:
 *   node scripts/migrateSearchFields.js --rollback=../logs/backup-searchfields-<date>-<time>.json
 *
 * OUTPUT:
 *   Console progress for every song processed.
 *   Backup snapshot written BEFORE any writes:  server/logs/backup-searchfields-<date>-<time>.json
 *   Full audit log written AFTER all writes:    server/logs/migration-searchfields-<date>-<time>.json
 *
 * SAFETY:
 *   - Dry-run flag makes the script fully non-destructive for review.
 *   - Backup captures the exact pre-migration state of every affected document.
 *   - Rollback restores only the fields this script touches (titleLower,
 *     artistLower) to their exact pre-migration values — all other fields are
 *     never disturbed.
 *   - Idempotency guard skips songs that already have both fields correctly set.
 *   - Uses Firestore batched writes (max 500 per batch) for efficiency on large
 *     collections while staying within Firestore limits.
 *   - Uses shared config/firebase.js — does NOT re-initialize Firebase Admin,
 *     which would conflict if any other module has already initialized it.
 *
 * BEFORE RUNNING:
 *   Ensure server/.env is populated with valid Firebase credentials.
 *   The script loads dotenv automatically.
 *   Always run --dry-run first and review output before the live run.
 *
 * AFTER RUNNING:
 *   Verify search functionality in a staging environment before deploying.
 *   Keep the backup file until the migration is confirmed stable in production.
 */

'use strict';

// Load env before any config modules are imported.
// Use absolute path so the script works when called from any working directory.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const fs   = require('fs');
const path = require('path');

// Use the shared Firebase config — never re-initialize Admin SDK in scripts.
// This keeps initialization consistent with the rest of the server codebase
// and avoids "app already exists" errors if other modules initialize first.
const { db } = require('../src/config/firebase');

// ─── Constants ────────────────────────────────────────────────────────────────

// Firestore hard limit: 500 operations per batch commit.
const FIRESTORE_BATCH_LIMIT = 500;

// Fields this migration adds. Used to build backup payloads and rollback logic.
const MIGRATION_FIELDS = ['titleLower', 'artistLower'];

// ─── CLI argument parsing ──────────────────────────────────────────────────────

const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');

const rollbackArg = args.find((a) => a.startsWith('--rollback='));
const ROLLBACK    = rollbackArg ? rollbackArg.split('=').slice(1).join('=') : null;

// ─── Logging / path setup ─────────────────────────────────────────────────────

const logsDir = path.resolve(__dirname, '../logs');
fs.mkdirSync(logsDir, { recursive: true });

const runStamp   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupFile = path.join(logsDir, `backup-searchfields-${runStamp}.json`);
const logFile    = path.join(logsDir, `migration-searchfields-${runStamp}.json`);
const auditLog   = [];

function logLine(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ─── ROLLBACK ─────────────────────────────────────────────────────────────────

/**
 * Reads a previously written backup file and restores the exact pre-migration
 * field values for every song captured. Uses Firestore batched writes for
 * efficiency. Fields that did not exist before the migration (stored as null
 * in the backup) are deleted via FieldValue.delete().
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

  const admin      = require('firebase-admin');
  const FieldValue = admin.firestore.FieldValue;

  let successCount = 0;
  let errorCount   = 0;

  // Process rollback in batches of FIRESTORE_BATCH_LIMIT
  for (let batchStart = 0; batchStart < entries.length; batchStart += FIRESTORE_BATCH_LIMIT) {
    const slice = entries.slice(batchStart, batchStart + FIRESTORE_BATCH_LIMIT);
    const batch = db.batch();

    for (const entry of slice) {
      const { songId, before } = entry;
      const restore = {};

      for (const [field, value] of Object.entries(before)) {
        // null sentinel → field did not exist before migration → delete it
        restore[field] = value === null ? FieldValue.delete() : value;
      }

      batch.set(db.collection('songs').doc(songId), restore, { merge: true });
    }

    try {
      await batch.commit();
      successCount += slice.length;
      logLine(`  ✓  Restored batch of ${slice.length} document(s). (${batchStart + slice.length}/${entries.length})`);
    } catch (err) {
      logLine(`  ✗  Batch rollback failed: ${err.message}`);
      errorCount += slice.length;
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
 * Captures the pre-migration state of every field this script will touch
 * for all documents that need to be migrated. Written to disk BEFORE the
 * first Firestore write so rollback is always possible, even if the migration
 * is interrupted partway through.
 *
 * Field value of null means the field did not exist before migration.
 * The rollback path treats null as a FieldValue.delete() sentinel.
 */
function writeBackup(toMigrate) {
  const entries = toMigrate.map((doc) => {
    const data   = doc.data();
    const before = {};

    for (const field of MIGRATION_FIELDS) {
      before[field] = Object.prototype.hasOwnProperty.call(data, field)
        ? (data[field] !== undefined ? data[field] : null)
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
    createdAt:      new Date().toISOString(),
    migration:      'migrateSearchFields',
    rollbackFields: MIGRATION_FIELDS,
    totalDocuments: entries.length,
    entries,
  };

  fs.writeFileSync(backupFile, JSON.stringify(payload, null, 2), 'utf8');
  logLine(`Backup written to:  ${backupFile}`);
  logLine(`To rollback:        node scripts/migrateSearchFields.js --rollback=${backupFile}`);
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  if (ROLLBACK) {
    await runRollback(ROLLBACK);
    return;
  }

  if (DRY_RUN) {
    logLine('DRY-RUN MODE — no data will be written to Firestore.');
  }

  logLine('Migration started: migrateSearchFields');
  logLine(`Audit log will be written to: ${logFile}`);

  // ── 1. Fetch all songs ──────────────────────────────────────────────────
  logLine('Fetching all songs from Firestore...');

  const snapshot = await db.collection('songs').get();
  const allDocs  = snapshot.docs;

  logLine(`Found ${allDocs.length} total song(s).`);

  // ── 2. Filter to songs that need migration ──────────────────────────────
  // A song is considered migrated when BOTH titleLower and artistLower are
  // already present and non-empty strings derived from the current title/artist.
  // We recompute the expected values and compare so stale lowercase values
  // (e.g. title was renamed after a previous migration run) are also corrected.
  const toMigrate = allDocs.filter((doc) => {
    const data = doc.data();

    const expectedTitleLower  = (data.title  || '').toLowerCase();
    const expectedArtistLower = (data.artist || '').toLowerCase();

    const hasTitle  = typeof data.titleLower  === 'string' && data.titleLower  === expectedTitleLower;
    const hasArtist = typeof data.artistLower === 'string' && data.artistLower === expectedArtistLower;

    return !(hasTitle && hasArtist);
  });

  const alreadyDone = allDocs.length - toMigrate.length;

  logLine(`${alreadyDone} song(s) already up-to-date (skipping).`);
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
    logLine(`[DRY-RUN] Backup would be written to: ${backupFile}`);
  }

  // ── 4. Process in batches ───────────────────────────────────────────────
  // Firestore batch writes are efficient and atomic per batch.
  // We chunk at FIRESTORE_BATCH_LIMIT (500) — the hard Firestore cap.
  let successCount = 0;
  let errorCount   = 0;
  let batchNumber  = 0;

  for (let batchStart = 0; batchStart < toMigrate.length; batchStart += FIRESTORE_BATCH_LIMIT) {
    const slice = toMigrate.slice(batchStart, batchStart + FIRESTORE_BATCH_LIMIT);
    batchNumber++;

    logLine(`Processing batch ${batchNumber} — ${slice.length} song(s)${DRY_RUN ? ' [DRY-RUN]' : ''}...`);

    // Build per-song audit entries for this batch
    const batchEntries = slice.map((doc) => {
      const data   = doc.data();
      const songId = doc.id;

      const titleLower  = (data.title  || '').toLowerCase();
      const artistLower = (data.artist || '').toLowerCase();

      return {
        songId,
        title:       data.title  || '(no title)',
        artist:      data.artist || '(no artist)',
        titleLower,
        artistLower,
        status:      'pending',
        error:       null,
        dryRun:      DRY_RUN,
      };
    });

    if (DRY_RUN) {
      // In dry-run mode, log what would be written but touch nothing
      for (const entry of batchEntries) {
        logLine(`  ℹ  [DRY-RUN] "${entry.title}" → titleLower="${entry.titleLower}" artistLower="${entry.artistLower}"`);
        entry.status = 'dry_run_would_update';
      }
      successCount += slice.length;
    } else {
      const batch = db.batch();

      for (let j = 0; j < slice.length; j++) {
        const doc   = slice[j];
        const entry = batchEntries[j];

        batch.update(doc.ref, {
          titleLower:  entry.titleLower,
          artistLower: entry.artistLower,
        });
      }

      try {
        await batch.commit();

        for (const entry of batchEntries) {
          entry.status = 'success';
        }

        successCount += slice.length;
        logLine(`  ✓  Batch ${batchNumber} committed (${slice.length} writes).`);
      } catch (err) {
        // Mark every entry in the failed batch as errored.
        // Do NOT exit — continue with remaining batches so partial progress is
        // captured in the audit log.
        for (const entry of batchEntries) {
          entry.status = 'error_batch_commit';
          entry.error  = err.message;
        }

        errorCount += slice.length;
        logLine(`  ✗  Batch ${batchNumber} failed: ${err.message}`);
      }
    }

    auditLog.push(...batchEntries);
  }

  // ── 5. Summary ──────────────────────────────────────────────────────────
  logLine('');
  logLine('─────────────────────────────────────────');
  logLine(DRY_RUN ? 'Dry run complete.' : 'Migration complete.');
  logLine(`  Songs processed : ${toMigrate.length}`);
  logLine(`  ✓  Success      : ${successCount}`);
  logLine(`  ✗  Errors       : ${errorCount}`);
  logLine('─────────────────────────────────────────');

  if (!DRY_RUN) {
    logLine(`Backup file:    ${backupFile}`);
    logLine(`To rollback:    node scripts/migrateSearchFields.js --rollback=${backupFile}`);
  }

  await writeAuditLog(auditLog);
  logLine(`Audit log:      ${logFile}`);

  if (errorCount > 0) {
    logLine(`⚠  ${errorCount} error(s) occurred. Review the audit log and consider rollback.`);
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