/**
 * server/src/jobs/SessionPicksQueue.js
 *
 * Phase 3 — Task 3.4: Background Job Queue for Session Picks
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS EXISTS
 * ───────────────
 * At 1000 active listeners, POST /api/users/:uid/session-picks receives up to
 * 200 requests per minute (client flushes every 5 songs). Each request was a
 * direct Firestore write inside the HTTP lifecycle — tightly coupling HTTP
 * throughput to Firestore write capacity.
 *
 * This queue decouples them:
 *   HTTP request  → enqueue() → immediate return (no Firestore call)
 *   setInterval   → drain()   → controlled Firestore writes at 5s intervals
 *
 * The HTTP response contract does NOT change:
 *   Controller still sends { success: true } immediately.
 *   The actual Firestore write is truly fire-and-forget.
 *
 * STORAGE STRATEGY
 * ─────────────────
 * Redis is currently a stub (server/src/config/redis.js returns no-ops).
 * This implementation uses an in-memory Map as the queue store. This is
 * correct for the current infrastructure and works for moderate scale.
 *
 * When Redis/Upstash is connected, swap the in-memory Map for a Bull queue
 * by replacing _enqueueInternal and _drainInternal — the public API surface
 * (enqueue, stats, shutdown) stays identical.
 *
 * QUEUE DATA MODEL
 * ─────────────────
 * The queue is a Map<uid, QueueEntry[]> where each entry holds:
 *   { picks: SanitizedPick[], sessionId: string, retries: number, enqueuedAt: number }
 *
 * Entries are grouped by uid so one drain call writes all pending picks for a
 * user in a single Firestore .add() — minimising write operations.
 *
 * DRAIN BEHAVIOUR
 * ────────────────
 * Every DRAIN_INTERVAL_MS (5s), the drainer:
 *   1. Snapshots all pending entries (uid → merged picks).
 *   2. Clears those entries from the queue immediately (prevents double-drain).
 *   3. Fires Firestore writes in parallel (Promise.allSettled — one uid failure
 *      does not affect others).
 *   4. Failed entries are re-queued with retries+1.
 *   5. Entries that exceed MAX_RETRIES are pushed to the in-memory dead-letter
 *      list (this._deadLetter) AND logged at error level so nothing is silently
 *      dropped without a trace.
 *
 * BUG-009 FIX — DEAD-LETTER PERSISTENCE
 * ──────────────────────────────────────
 * Previous behaviour: dead-lettered picks were only logged via logger.error
 * and then discarded. If the log pipeline was down or logs were not monitored,
 * picks were silently lost with no way to inspect or replay them.
 *
 * Fix: failed picks that exceed MAX_RETRIES are now pushed to this._deadLetter
 * (an in-memory array capped at DEAD_LETTER_MAX). The dead-letter list is
 * exposed via stats() so the /health and /ready endpoints (and any future
 * alerting) can surface it. Engineers can inspect picks via stats().deadLetter
 * during an incident without needing to parse logs.
 *
 * DEAD_LETTER_MAX (100): oldest entries are evicted when the list exceeds this.
 * If dead-letter fills up it means Firestore has been down for an extended
 * period — the warning log and stats counter are the signal to act.
 *
 * MEMORY SAFETY
 * ──────────────
 *   MAX_PICKS_PER_UID (500)       — oldest picks evicted when a single uid exceeds cap.
 *   MAX_TOTAL_ENTRIES_WARN (10000) — drain is forced when total queue depth hits this.
 *   DEAD_LETTER_MAX (100)         — dead-letter ring buffer cap.
 *   All caps log warnings so engineers know when scale demands Redis.
 *
 * GRACEFUL SHUTDOWN
 * ──────────────────
 * shutdown() stops the interval and drains remaining entries once.
 * Called by server/src/index.js on SIGTERM / SIGINT so no picks are lost
 * when the server restarts (e.g. Render deploys a new instance).
 *
 * FIRESTORE WRITE TARGET
 * ───────────────────────
 * Writes to: users/{uid}/sessionPicks subcollection — .add()
 * This EXACTLY matches the pattern used in the original controller:
 *   db.collection('users').doc(uid).collection('sessionPicks').add(...)
 * The UserRepository.appendSessionPicks method writes to a different field
 * (sessionHistory). The queue uses the subcollection pattern to stay consistent
 * with existing data already written to production Firestore.
 *
 * USAGE
 * ──────
 * // In controller (replaces direct retryFirestore call):
 * const { sessionPicksQueue } = require('../jobs/SessionPicksQueue');
 * sessionPicksQueue.enqueue(uid, sanitizedPicks, sessionId);
 *
 * // In server/src/index.js (graceful shutdown — already wired):
 * const { sessionPicksQueue } = require('./jobs/SessionPicksQueue');
 * process.on('SIGTERM', async () => {
 *   await sessionPicksQueue.shutdown();
 *   process.exit(0);
 * });
 */

'use strict';

const { db }             = require('../config/firebase');
const { retryFirestore } = require('../utils/retryFirestore');
const logger             = require('../utils/logger');

  const { FieldValue } = require('firebase-admin/firestore');
  const cache = require('../services/cache.service');
// ── Queue configuration constants ─────────────────────────────────────────────

/** How often the drainer fires (milliseconds). */
const DRAIN_INTERVAL_MS = 5_000;

/**
 * Max Firestore writes per drain cycle (across all uids).
 * Prevents a single large drain from saturating the write pool.
 * Remaining entries stay queued for the next drain.
 */
const MAX_WRITES_PER_DRAIN = 50;

/**
 * Max picks stored per uid. If a uid's queued picks exceed this,
 * the oldest entries are evicted (FIFO). Prevents one power-user
 * from consuming unbounded memory.
 */
const MAX_PICKS_PER_UID = 500;

/**
 * Total queue depth warning threshold. When the queue holds more
 * entries than this across all uids, a warning is logged. This signals
 * that Firestore writes are falling behind ingest rate — time to add Redis.
 */
const MAX_TOTAL_ENTRIES_WARN = 10_000;

/**
 * Max retry attempts before a batch is sent to dead-letter.
 * Each failed drain attempt increments the retry counter on that batch.
 */
const MAX_RETRIES = 3;

/**
 * BUG-009 FIX: Max entries kept in the in-memory dead-letter list.
 * Acts as a ring buffer — oldest entries are evicted when this cap is hit.
 * Sized conservatively: 100 entries × ~50 picks each = ~5000 picks max in memory.
 * If this fills, it means Firestore has been unreachable for an extended period.
 */
const DEAD_LETTER_MAX = 100;

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @typedef {object} SanitizedPick
 * @property {string}      songId
 * @property {string|null} previousSongId
 * @property {string}      contextType
 * @property {string|null} contextId
 * @property {number}      clientTs
 */

/**
 * @typedef {object} QueueEntry
 * @property {SanitizedPick[]} picks
 * @property {string}          sessionId
 * @property {number}          retries      — number of failed drain attempts
 * @property {number}          enqueuedAt   — Date.now() when first enqueued
 */

/**
 * @typedef {object} DeadLetterEntry
 * @property {string}          uid
 * @property {SanitizedPick[]} picks
 * @property {string}          sessionId
 * @property {number}          retries
 * @property {string|undefined} error
 * @property {number}          deadLetteredAt  — Date.now() when dead-lettered
 */

// ─────────────────────────────────────────────────────────────────────────────

class SessionPicksQueue {
  constructor() {
    /**
     * Primary queue: uid → QueueEntry[]
     * Each uid can have multiple entries (one per enqueue call that hasn't
     * been drained yet). The drainer merges all entries for a uid into one
     * Firestore write.
     * @type {Map<string, QueueEntry[]>}
     */
    this._queue = new Map();

    /** Total number of pick items across all entries (for depth monitoring). */
    this._totalPickCount = 0;

    /** Whether a drain is currently in progress (prevents overlapping drains). */
    this._draining = false;

    /** Whether shutdown has been requested. */
    this._shutdown = false;

    /** The setInterval handle — stored for clearInterval on shutdown. */
    this._intervalHandle = null;

    /**
     * BUG-009 FIX: In-memory dead-letter list.
     * Picks that fail all MAX_RETRIES attempts land here instead of being
     * silently discarded. Capped at DEAD_LETTER_MAX (ring buffer — oldest
     * evicted when cap is hit). Exposed via stats() for monitoring.
     * @type {DeadLetterEntry[]}
     */
    this._deadLetter = [];

    /** Counters for stats(). */
    this._stats = {
      totalEnqueued:     0,
      totalWritten:      0,
      totalFailed:       0,
      totalDeadLettered: 0,
      drainCount:        0,
    };

    // Start the drainer immediately
    this._startDrainer();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PUBLIC API
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * enqueue(uid, sanitizedPicks, sessionId)
   *
   * Add a batch of sanitized picks to the queue for the given uid.
   * This is synchronous and non-blocking — no Firestore call is made.
   * Called from the controller AFTER res.json({ success: true }) has been sent.
   *
   * @param {string}          uid
   * @param {SanitizedPick[]} sanitizedPicks — pre-validated, pre-sanitized picks
   * @param {string}          sessionId      — `${uid}_${YYYY-MM-DD}`
   * @returns {void}
   */
  enqueue(uid, sanitizedPicks, sessionId) {
    if (this._shutdown) {
      logger.warn('[SessionPicksQueue] enqueue called after shutdown — discarding', {
        uid,
        count: sanitizedPicks.length,
      });
      return;
    }

    if (!uid || !Array.isArray(sanitizedPicks) || sanitizedPicks.length === 0) {
      return; // nothing to queue
    }

    // ── Memory safety: enforce per-uid pick cap ──────────────────────────────
    const currentEntries   = this._queue.get(uid) || [];
    const currentPickCount = currentEntries.reduce((sum, e) => sum + e.picks.length, 0);

    let picksToEnqueue = sanitizedPicks;

    if (currentPickCount + sanitizedPicks.length > MAX_PICKS_PER_UID) {
      const allowedCount = Math.max(0, MAX_PICKS_PER_UID - currentPickCount);
      if (allowedCount === 0) {
        logger.warn('[SessionPicksQueue] uid pick cap reached — discarding batch', {
          uid,
          currentCount: currentPickCount,
          cap:          MAX_PICKS_PER_UID,
          discarding:   sanitizedPicks.length,
        });
        this._stats.totalDeadLettered += sanitizedPicks.length;
        return;
      }
      // Allow partial batch — take the first N picks that fit
      picksToEnqueue = sanitizedPicks.slice(0, allowedCount);
      logger.warn('[SessionPicksQueue] uid pick cap partially reached — truncating batch', {
        uid,
        currentCount: currentPickCount,
        cap:          MAX_PICKS_PER_UID,
        requested:    sanitizedPicks.length,
        allowed:      allowedCount,
      });
    }

    // ── Append entry to uid's queue ──────────────────────────────────────────
    const entry = {
      picks:      picksToEnqueue,
      sessionId,
      retries:    0,
      enqueuedAt: Date.now(),
    };

    currentEntries.push(entry);
    this._queue.set(uid, currentEntries);
    this._totalPickCount        += picksToEnqueue.length;
    this._stats.totalEnqueued   += picksToEnqueue.length;

    // ── Total depth warning ──────────────────────────────────────────────────
    if (this._totalPickCount >= MAX_TOTAL_ENTRIES_WARN) {
      logger.warn('[SessionPicksQueue] total queue depth at warning threshold', {
        totalPickCount: this._totalPickCount,
        threshold:      MAX_TOTAL_ENTRIES_WARN,
        uids:           this._queue.size,
        action:         'Firestore writes falling behind — consider Redis/Bull queue',
      });
    }

    // ── Force immediate drain if we hit the warn threshold ───────────────────
    if (this._totalPickCount >= MAX_TOTAL_ENTRIES_WARN && !this._draining) {
      logger.warn('[SessionPicksQueue] forcing immediate drain due to queue depth');
      setImmediate(() => this._drain());
    }
  }

  /**
   * stats() → object
   *
   * Returns current queue metrics. Used by the /health and /ready endpoints
   * and for operational monitoring.
   *
   * BUG-009 FIX: Now includes deadLetterCount and deadLetter (last 20 entries)
   * so the dead-letter state is visible without parsing logs.
   *
   * @returns {{
   *   pendingUids: number,
   *   totalPickCount: number,
   *   draining: boolean,
   *   shutdown: boolean,
   *   totalEnqueued: number,
   *   totalWritten: number,
   *   totalFailed: number,
   *   totalDeadLettered: number,
   *   drainCount: number,
   *   deadLetterCount: number,
   *   deadLetter: DeadLetterEntry[]
   * }}
   */
  stats() {
    return {
      pendingUids:       this._queue.size,
      totalPickCount:    this._totalPickCount,
      draining:          this._draining,
      shutdown:          this._shutdown,
      ...this._stats,
      // BUG-009 FIX: expose dead-letter for monitoring/alerting
      deadLetterCount:   this._deadLetter.length,
      deadLetter:        this._deadLetter.slice(-20), // last 20 for inspection
    };
  }

  /**
   * shutdown() → Promise<void>
   *
   * Stops the interval timer and performs one final drain of all remaining
   * queue entries. Called by SIGTERM / SIGINT handlers in server/src/index.js
   * to ensure no picks are lost during a graceful server restart.
   *
   * After shutdown() resolves, any further enqueue() calls are silently discarded.
   *
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (this._shutdown) return;

    logger.info('[SessionPicksQueue] shutdown initiated — draining remaining entries', {
      pendingUids:    this._queue.size,
      totalPickCount: this._totalPickCount,
    });

    this._shutdown = true;

    // Stop the interval so no new drain fires during shutdown drain
    if (this._intervalHandle) {
      clearInterval(this._intervalHandle);
      this._intervalHandle = null;
    }

    // Wait for any in-progress drain to complete before starting the final drain
    if (this._draining) {
      await this._waitForDrainComplete();
    }

    // Final drain — writes all remaining picks to Firestore
    if (this._queue.size > 0) {
      await this._drain({ isShutdown: true });
    }

    logger.info('[SessionPicksQueue] shutdown complete', this.stats());
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INTERNAL — DRAINER
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * _startDrainer()
   *
   * Starts the setInterval that calls _drain() every DRAIN_INTERVAL_MS.
   * Called once from the constructor.
   */
  _startDrainer() {
    this._intervalHandle = setInterval(() => {
      if (!this._draining && this._queue.size > 0) {
        this._drain().catch((err) => {
          // _drain() is designed to never throw — this catch is a last resort.
          logger.error('[SessionPicksQueue] unexpected drain error', {
            error: err.message,
          });
        });
      }
    }, DRAIN_INTERVAL_MS);

    // Don't keep the Node.js process alive just for this interval
    if (this._intervalHandle.unref) {
      this._intervalHandle.unref();
    }
  }

  /**
   * _drain(opts?) → Promise<void>
   *
   * Core drain loop. Runs at most MAX_WRITES_PER_DRAIN uid writes per cycle.
   * Remaining uids stay in the queue for the next drain.
   *
   * Design:
   *   1. Snapshot up to MAX_WRITES_PER_DRAIN uids from the queue.
   *   2. Remove those entries from the live queue immediately (prevents
   *      double-drain if next interval fires while this drain is running).
   *   3. Merge all entries per uid into one picks array + one sessionId.
   *   4. Fire Firestore writes in parallel with Promise.allSettled.
   *   5. Re-queue failed entries (up to MAX_RETRIES), dead-letter the rest.
   *
   * BUG-009 FIX: Dead-lettered entries are pushed to this._deadLetter
   * (in addition to being logged) so they are inspectable via stats().
   *
   * @param {{ isShutdown?: boolean }} [opts]
   * @returns {Promise<void>}
   */
  async _drain(opts = {}) {
    if (this._draining && !opts.isShutdown) return;
    if (this._queue.size === 0) return;

    this._draining = true;
    this._stats.drainCount++;

    try {
      // ── Step 1: Snapshot uid batch ────────────────────────────────────────
      // Take up to MAX_WRITES_PER_DRAIN uids. On shutdown, take ALL uids.
      const uidsToProcess = opts.isShutdown
        ? Array.from(this._queue.keys())
        : Array.from(this._queue.keys()).slice(0, MAX_WRITES_PER_DRAIN);

      if (uidsToProcess.length === 0) return;

      // ── Step 2: Snapshot and remove from live queue ───────────────────────
      // Removal happens BEFORE the async writes so that new enqueue() calls
      // during this drain go into fresh entries — never into this drain's batch.
      const batch = new Map(); // uid → { picks: [], sessionId, retries }

      for (const uid of uidsToProcess) {
        const entries = this._queue.get(uid);
        if (!entries || entries.length === 0) {
          this._queue.delete(uid);
          continue;
        }

        // Merge all entries for this uid: combine picks, use most recent sessionId,
        // track the maximum retry count so re-queued batches don't reset.
        const merged = entries.reduce(
          (acc, entry) => {
            acc.picks.push(...entry.picks);
            acc.sessionId = entry.sessionId;
            acc.retries   = Math.max(acc.retries, entry.retries);
            return acc;
          },
          { picks: [], sessionId: '', retries: 0 },
        );

        batch.set(uid, merged);

        // Remove from live queue — new entries will start a fresh array
        this._queue.delete(uid);
        this._totalPickCount -= entries.reduce((sum, e) => sum + e.picks.length, 0);
        // Guard against negative count (should never happen, but be safe)
        if (this._totalPickCount < 0) this._totalPickCount = 0;
      }

      // ── Step 3: Fire Firestore writes in parallel ─────────────────────────
      const writeResults = await Promise.allSettled(
        Array.from(batch.entries()).map(([uid, { picks, sessionId }]) =>
          this._writeToFirestore(uid, picks, sessionId),
        ),
      );

      // ── Step 4: Handle results ────────────────────────────────────────────
      const batchEntries = Array.from(batch.entries());

      for (let i = 0; i < batchEntries.length; i++) {
        const [uid, { picks, sessionId, retries }] = batchEntries[i];
        const result = writeResults[i];

        if (result.status === 'fulfilled') {
          this._stats.totalWritten += picks.length;
          // success — already removed from queue, nothing more to do
        } else {
          // Write failed — decide whether to re-queue or dead-letter
          this._stats.totalFailed += picks.length;

          if (retries < MAX_RETRIES) {
            // Re-queue with incremented retry count
            const reEntry = {
              picks,
              sessionId,
              retries:    retries + 1,
              enqueuedAt: Date.now(),
            };

            const existing = this._queue.get(uid) || [];
            existing.unshift(reEntry); // prepend so it's drained first next cycle
            this._queue.set(uid, existing);
            this._totalPickCount += picks.length;

            logger.warn('[SessionPicksQueue] write failed — re-queued', {
              uid,
              picks:      picks.length,
              retries:    retries + 1,
              maxRetries: MAX_RETRIES,
              error:      result.reason?.message,
            });
          } else {
            // ── BUG-009 FIX: Dead-letter with persistence ─────────────────
            // Previously: only logged, then silently discarded.
            // Now: pushed to this._deadLetter so it is inspectable via stats()
            // without requiring log access. Ring buffer — evict oldest when
            // DEAD_LETTER_MAX is hit so memory stays bounded.
            this._stats.totalDeadLettered += picks.length;

            const deadEntry = {
              uid,
              picks,
              sessionId,
              retries,
              error:          result.reason?.message,
              deadLetteredAt: Date.now(),
            };

            this._deadLetter.push(deadEntry);

            // Evict oldest entries if ring buffer is full
            if (this._deadLetter.length > DEAD_LETTER_MAX) {
              const evicted = this._deadLetter.splice(0, this._deadLetter.length - DEAD_LETTER_MAX);
              logger.warn('[SessionPicksQueue] dead-letter ring buffer full — evicting oldest entries', {
                evicted:      evicted.length,
                deadLetterMax: DEAD_LETTER_MAX,
              });
            }

            logger.error('[SessionPicksQueue] dead-letter: picks exceeded max retries', {
              uid,
              picks:          picks.length,
              retries,
              sessionId,
              error:          result.reason?.message,
              deadLetterSize: this._deadLetter.length,
              action:         'investigate Firestore connectivity — picks are in dead-letter; inspect via stats().deadLetter',
            });
          }
        }
      }
    } finally {
      // Always release the drain lock — even if something unexpected throws
      this._draining = false;
    }
  }

  /**
   * _writeToFirestore(uid, picks, sessionId) → Promise<void>
   *
   * The single Firestore write per uid per drain cycle.
   * Writes to: users/{uid}/sessionPicks subcollection via .add()
   *
   * This EXACTLY matches the original controller pattern:
   *   db.collection('users').doc(uid).collection('sessionPicks').add(...)
   *
   * Uses retryFirestore with maxAttempts:2 — same as the original controller.
   * (The drain retry loop handles retries beyond this at the queue level.)
   *
   * @param {string}          uid
   * @param {SanitizedPick[]} picks
   * @param {string}          sessionId
   * @returns {Promise<void>}
   */
async _writeToFirestore(uid, picks, sessionId) {

  // 1. Write session history (unchanged)
  await retryFirestore(
    () =>
      db
        .collection('users')
        .doc(uid)
        .collection('sessionPicks')
        .add({
          sessionId,
          picks,
          pickedAt:  new Date(),
          batchSize: picks.length,
        }),
    { maxAttempts: 2, label: `SessionPicksQueue.write(${uid})` },
  );

  // 2. Increment totalSessionPicks on user document (atomic, merge-safe)
  await retryFirestore(
    () =>
      db.collection('users').doc(uid).set(
        { totalSessionPicks: FieldValue.increment(picks.length) },
        { merge: true },
      ),
    { label: `SessionPicksQueue.incrementTotal(${uid})` },
  );

  // 3. Increment playCount for each unique songId in this batch
  const songPlayCounts = {};
  for (const pick of picks) {
    if (pick.songId) {
      songPlayCounts[pick.songId] = (songPlayCounts[pick.songId] || 0) + 1;
    }
  }

  await Promise.allSettled(
    Object.entries(songPlayCounts).map(([songId, count]) =>
      db.collection('songs').doc(songId).set(
        { playCount: FieldValue.increment(count) },
        { merge: true },
      )
    )
  );

  // 4. Invalidate cache so dashboard reads fresh playCount
  Object.keys(songPlayCounts).forEach(songId => {
    cache.del(`songs:id:${songId}`);
  });
  const allKeys = cache.keys ? cache.keys() : [];
  allKeys
    .filter((k) => k.startsWith('songs:list:'))
    .forEach((k) => cache.del(k));
}

  /**
   * _waitForDrainComplete() → Promise<void>
   *
   * Polls until _draining is false. Used by shutdown() to wait for any
   * in-progress drain cycle to finish before starting the final shutdown drain.
   * Max wait: 10s (prevents infinite hang if something goes wrong).
   *
   * @returns {Promise<void>}
   */
  _waitForDrainComplete() {
    return new Promise((resolve) => {
      const maxWaitMs = 10_000;
      const pollMs    = 100;
      let   elapsed   = 0;

      const check = () => {
        if (!this._draining || elapsed >= maxWaitMs) {
          resolve();
          return;
        }
        elapsed += pollMs;
        setTimeout(check, pollMs);
      };

      setTimeout(check, pollMs);
    });
  }
}

// ── Singleton export ──────────────────────────────────────────────────────────
//
// One instance per process. The queue accumulates picks across all requests.
// Instantiated when this module is first require()'d (at server startup).
// Do NOT instantiate SessionPicksQueue directly in controllers — import this.
//
const sessionPicksQueue = new SessionPicksQueue();

module.exports = { SessionPicksQueue, sessionPicksQueue };