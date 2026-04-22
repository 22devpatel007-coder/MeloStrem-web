/**
 * server/src/repositories/BaseRepository.js
 *
 * Phase 2 — Task 2.1: BaseRepository with Circuit Breaker
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * The single Firestore access layer for ALL repository subclasses.
 * Every db.collection() call in the codebase should eventually flow through
 * one of these methods — never through ad-hoc Firestore calls in controllers.
 *
 * Architecture:
 *   Controller  →  Service  →  Repository  →  BaseRepository  →  Firestore
 *
 * What this class owns:
 *   - formatDoc()          : converts Firestore DocumentSnapshot → plain object
 *   - findById()           : fetch one document by ID
 *   - findPaginated()      : cursor-paginated collection query
 *   - batchGet()           : fetch up to MAX_BATCH_SIZE docs in one roundtrip
 *   - create()             : add a new document (auto or manual ID)
 *   - set()                : set a document (overwrite or merge)
 *   - update()             : partial update an existing document
 *   - delete()             : delete a document
 *   - executeWithRetry()   : wrap any Firestore lambda in retryFirestore()
 *   - Circuit breaker      : CLOSED → OPEN → HALF-OPEN state machine
 *
 * Circuit Breaker Design:
 *   CLOSED   — normal operation. All calls go through.
 *   OPEN     — after FAILURE_THRESHOLD consecutive failures in FAILURE_WINDOW_MS,
 *              all calls immediately throw a ServiceUnavailableError. No Firestore
 *              calls are attempted. Prevents cascading failures under load.
 *   HALF-OPEN — after RECOVERY_TIMEOUT_MS, one probe request is allowed through.
 *              Success → CLOSED. Failure → OPEN again for another timeout window.
 *
 * Constants (tuned for Render free tier + Firebase Admin SDK REST transport):
 *   FAILURE_THRESHOLD  : 5   — 5 consecutive failures → open circuit
 *   FAILURE_WINDOW_MS  : 30s — reset failure count if no failure in 30s
 *   RECOVERY_TIMEOUT_MS: 10s — try one probe 10s after circuit opens
 *
 * Subclasses must NOT override executeWithRetry or _callFirestore.
 * Subclasses add collection-specific query methods by calling this._callFirestore().
 *
 * Usage:
 *   class SongRepository extends BaseRepository {
 *     constructor(db) { super(db, 'songs'); }
 *     async findAll(limit, cursor) { ... use this._callFirestore(...) ... }
 *   }
 */

'use strict';

const { retryFirestore } = require('../utils/retryFirestore');
const logger             = require('../utils/logger');

// ── Circuit breaker constants ─────────────────────────────────────────────────
const FAILURE_THRESHOLD   = 5;
const FAILURE_WINDOW_MS   = 30_000;  // 30s window to track consecutive failures
const RECOVERY_TIMEOUT_MS = 10_000;  // wait 10s before allowing a probe

// ── Batch size cap ────────────────────────────────────────────────────────────
const MAX_BATCH_SIZE      = 500;     // Firestore getAll() hard limit
const MAX_QUERY_LIMIT     = 50;      // max rows returned per paginated query
const MAX_ALBUM_SONGS     = 200;     // albums are small; allow slightly larger cap

// ── Circuit states ────────────────────────────────────────────────────────────
const STATE = Object.freeze({ CLOSED: 'CLOSED', OPEN: 'OPEN', HALF_OPEN: 'HALF_OPEN' });

class BaseRepository {
  /**
   * @param {FirebaseFirestore.Firestore} db              — Firestore db instance
   * @param {string}                      collectionName  — primary Firestore collection
   */
  constructor(db, collectionName) {
    if (!db)             throw new Error('BaseRepository: db is required');
    if (!collectionName) throw new Error('BaseRepository: collectionName is required');

    this._db         = db;
    this._collection = collectionName;

    // ── Circuit breaker state ─────────────────────────────────────────────────
    this._cbState          = STATE.CLOSED;
    this._failureCount     = 0;
    this._lastFailureTime  = null;  // timestamp of most recent failure
    this._openedAt         = null;  // timestamp when circuit transitioned to OPEN
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CIRCUIT BREAKER — internal state machine
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * _cbCanCall() → boolean
   * Returns true if the circuit is CLOSED or HALF-OPEN (probe allowed).
   * Returns false if the circuit is OPEN and recovery window has not elapsed.
   * Side-effect: transitions OPEN → HALF-OPEN when recovery window elapses.
   */
  _cbCanCall() {
    const now = Date.now();

    if (this._cbState === STATE.CLOSED) return true;

    if (this._cbState === STATE.OPEN) {
      if (now - this._openedAt >= RECOVERY_TIMEOUT_MS) {
        // Recovery window elapsed — allow one probe
        this._cbState = STATE.HALF_OPEN;
        logger.warn(`[CircuitBreaker][${this._collection}] OPEN → HALF_OPEN (probe allowed)`);
        return true;
      }
      return false; // still open, reject immediately
    }

    // HALF_OPEN — probe already in progress, allow it through
    return true;
  }

  /**
   * _cbOnSuccess() — called when a Firestore call succeeds.
   * CLOSED:    resets failure counter.
   * HALF_OPEN: probe succeeded → close circuit.
   */
  _cbOnSuccess() {
    if (this._cbState === STATE.HALF_OPEN) {
      logger.info(`[CircuitBreaker][${this._collection}] HALF_OPEN → CLOSED (probe succeeded)`);
    }
    this._cbState         = STATE.CLOSED;
    this._failureCount    = 0;
    this._lastFailureTime = null;
    this._openedAt        = null;
  }

  /**
   * _cbOnFailure(err) — called when a Firestore call fails (after all retries).
   * Increments failure count; if threshold reached inside the window, opens circuit.
   * HALF_OPEN failures immediately re-open the circuit.
   * @param {Error} err
   */
  _cbOnFailure(err) {
    const now = Date.now();

    if (this._cbState === STATE.HALF_OPEN) {
      // Probe failed — re-open immediately
      this._cbState  = STATE.OPEN;
      this._openedAt = now;
      logger.error(`[CircuitBreaker][${this._collection}] HALF_OPEN → OPEN (probe failed)`, {
        error: err.message,
      });
      return;
    }

    // Reset failure window if last failure was more than FAILURE_WINDOW_MS ago
    if (this._lastFailureTime && now - this._lastFailureTime > FAILURE_WINDOW_MS) {
      this._failureCount = 0;
    }

    this._failureCount++;
    this._lastFailureTime = now;

    if (this._failureCount >= FAILURE_THRESHOLD) {
      this._cbState  = STATE.OPEN;
      this._openedAt = now;
      logger.error(
        `[CircuitBreaker][${this._collection}] CLOSED → OPEN ` +
        `(${this._failureCount} consecutive failures in ${FAILURE_WINDOW_MS}ms)`,
        { error: err.message },
      );
    } else {
      logger.warn(
        `[CircuitBreaker][${this._collection}] failure ${this._failureCount}/${FAILURE_THRESHOLD}`,
        { error: err.message },
      );
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // CORE CALL WRAPPER
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * _callFirestore(fn, label) — the SINGLE entry point for all Firestore calls.
   *
   * 1. Checks circuit breaker — throws immediately if OPEN.
   * 2. Wraps fn in retryFirestore() for transient network errors.
   * 3. Updates circuit breaker state on success or failure.
   *
   * All repository methods must use this instead of calling retryFirestore directly.
   *
   * @template T
   * @param {() => Promise<T>} fn     — Firestore operation lambda
   * @param {string}           label  — log label for diagnostics
   * @returns {Promise<T>}
   */
  async _callFirestore(fn, label = '') {
    if (!this._cbCanCall()) {
      const err = new Error(
        `[${this._collection}] Service temporarily unavailable (circuit open). ` +
        `Retry in ${Math.ceil((RECOVERY_TIMEOUT_MS - (Date.now() - this._openedAt)) / 1000)}s.`
      );
      err.code       = 'CIRCUIT_OPEN';
      err.statusCode = 503;
      throw err;
    }

    try {
      const result = await retryFirestore(fn, { label: `${this._collection}.${label}` });
      this._cbOnSuccess();
      return result;
    } catch (err) {
      this._cbOnFailure(err);
      throw err;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // DOCUMENT FORMATTING
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * formatDoc(snap) → plain object
   *
   * Converts a Firestore DocumentSnapshot into a serializable plain object.
   * - Converts Firestore Timestamps to ISO strings.
   * - Never returns a Firestore DocumentSnapshot to callers.
   * - Returns null for non-existent documents (callers must check).
   *
   * @param {FirebaseFirestore.DocumentSnapshot} snap
   * @returns {object | null}
   */
  formatDoc(snap) {
    if (!snap || !snap.exists) return null;
    const data = snap.data();
    return {
      id: snap.id,
      ...data,
      createdAt: data.createdAt?.toDate
        ? data.createdAt.toDate().toISOString()
        : (data.createdAt ?? null),
      updatedAt: data.updatedAt?.toDate
        ? data.updatedAt.toDate().toISOString()
        : (data.updatedAt ?? null),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // BASE CRUD METHODS
  // ══════════════════════════════════════════════════════════════════════════════

  /**
   * findById(id, collection?) → object | null
   *
   * Fetch a single document by ID.
   * Pass collection to query a different collection than this._collection.
   *
   * @param {string}  id
   * @param {string}  [collection]  — override collection (for cross-collection reads)
   * @returns {Promise<object | null>}
   */
  async findById(id, collection) {
    const col = collection || this._collection;
    return this._callFirestore(async () => {
      const snap = await this._db.collection(col).doc(String(id).trim()).get();
      return this.formatDoc(snap);
    }, `findById(${id})`);
  }

  /**
   * findPaginated(query, limit, cursor) → { items, nextCursor, hasMore }
   *
   * Cursor-paginated query. Enforces MAX_QUERY_LIMIT.
   * cursor is a Firestore document ID (string), not a DocumentSnapshot.
   *
   * @param {FirebaseFirestore.Query} baseQuery   — Firestore query (with orderBy applied)
   * @param {number}                  limit        — page size (capped at MAX_QUERY_LIMIT)
   * @param {string | null}           cursor       — document ID to start after
   * @param {number}                  [maxLimit]   — override cap (for album songs: 200)
   * @returns {Promise<{ items: object[], nextCursor: string|null, hasMore: boolean }>}
   */
  async findPaginated(baseQuery, limit, cursor, maxLimit = MAX_QUERY_LIMIT) {
    const safeLimitCap = maxLimit;
    const safeLimit    = Math.min(Math.max(1, parseInt(limit) || 30), safeLimitCap);

    if (safeLimit !== limit) {
      logger.warn(
        `[BaseRepository][${this._collection}] findPaginated: ` +
        `requested limit ${limit} capped to ${safeLimit}`
      );
    }

    return this._callFirestore(async () => {
      let q = baseQuery.limit(safeLimit);

      if (cursor) {
        const cursorSnap = await this._db
          .collection(this._collection)
          .doc(String(cursor).trim())
          .get();
        if (cursorSnap.exists) {
          q = q.startAfter(cursorSnap);
        }
      }

      const snapshot = await q.get();
      const items    = snapshot.docs.map((doc) => this.formatDoc(doc));
      const lastDoc  = snapshot.docs[snapshot.docs.length - 1];

      return {
        items,
        nextCursor: snapshot.docs.length === safeLimit && lastDoc ? lastDoc.id : null,
        hasMore:    snapshot.docs.length === safeLimit,
      };
    }, `findPaginated(limit=${safeLimit},cursor=${cursor})`);
  }

  /**
   * batchGet(ids, collection?) → object[]
   *
   * Fetch multiple documents in a single Firestore roundtrip (db.getAll).
   * More efficient than N individual findById calls.
   * Missing documents are silently skipped (same behaviour as existing getSongsBatch).
   * Batch size is capped at MAX_BATCH_SIZE (Firestore hard limit: 500).
   *
   * @param {string[]} ids
   * @param {string}   [collection]  — override collection
   * @returns {Promise<object[]>}
   */
  async batchGet(ids, collection) {
    if (!Array.isArray(ids) || ids.length === 0) return [];

    const col      = collection || this._collection;
    const safeIds  = ids.slice(0, MAX_BATCH_SIZE).map((id) => String(id).trim());

    if (safeIds.length < ids.length) {
      logger.warn(
        `[BaseRepository][${col}] batchGet: ` +
        `requested ${ids.length} ids, capped to ${MAX_BATCH_SIZE}`
      );
    }

    return this._callFirestore(async () => {
      const refs  = safeIds.map((id) => this._db.collection(col).doc(id));
      const snaps = await this._db.getAll(...refs);
      return snaps
        .filter((snap) => snap.exists)
        .map((snap)   => this.formatDoc(snap));
    }, `batchGet(${safeIds.length} ids)`);
  }

  /**
   * create(data, collection?) → object
   *
   * Add a new document with a Firestore auto-generated ID.
   * Returns the created document with its assigned id.
   *
   * @param {object} data
   * @param {string} [collection]
   * @returns {Promise<object>}
   */
  async create(data, collection) {
    const col = collection || this._collection;
    return this._callFirestore(async () => {
      const docRef = await this._db.collection(col).add(data);
      return { id: docRef.id, ...data };
    }, 'create');
  }

  /**
   * set(id, data, options?, collection?) → object
   *
   * Set a document by ID. Supports merge mode for upsert semantics.
   * Used by findOrCreateArtist / findOrCreateAlbum patterns.
   *
   * @param {string}                        id
   * @param {object}                        data
   * @param {{ merge?: boolean }}           [options]   — default: { merge: false }
   * @param {string}                        [collection]
   * @returns {Promise<object>}
   */
  async set(id, data, options = {}, collection) {
    const col = collection || this._collection;
    return this._callFirestore(async () => {
      await this._db.collection(col).doc(String(id).trim()).set(data, options);
      return { id, ...data };
    }, `set(${id})`);
  }

  /**
   * update(id, data, collection?) → object
   *
   * Partially update an existing document. Throws if document does not exist.
   * For upsert semantics, use set() with { merge: true }.
   *
   * @param {string} id
   * @param {object} data
   * @param {string} [collection]
   * @returns {Promise<object>}
   */
  async update(id, data, collection) {
    const col = collection || this._collection;
    return this._callFirestore(async () => {
      await this._db.collection(col).doc(String(id).trim()).update(data);
      return { id, ...data };
    }, `update(${id})`);
  }

  /**
   * delete(id, collection?) → boolean
   *
   * Delete a document by ID.
   * Returns true on success (even if document didn't exist — Firestore delete is idempotent).
   *
   * @param {string} id
   * @param {string} [collection]
   * @returns {Promise<boolean>}
   */
  async delete(id, collection) {
    const col = collection || this._collection;
    return this._callFirestore(async () => {
      await this._db.collection(col).doc(String(id).trim()).delete();
      return true;
    }, `delete(${id})`);
  }

  /**
   * executeWithRetry(fn, label?) → T
   *
   * Public escape hatch for subclasses that need to run a custom multi-step
   * Firestore operation that doesn't fit the base CRUD primitives.
   * Still goes through the circuit breaker.
   *
   * @template T
   * @param {() => Promise<T>} fn
   * @param {string}           [label]
   * @returns {Promise<T>}
   */
  async executeWithRetry(fn, label = 'custom') {
    return this._callFirestore(fn, label);
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // UTILITY — expose limit constants for subclasses
  // ══════════════════════════════════════════════════════════════════════════════

  static get MAX_QUERY_LIMIT()  { return MAX_QUERY_LIMIT;  }
  static get MAX_BATCH_SIZE()   { return MAX_BATCH_SIZE;   }
  static get MAX_ALBUM_SONGS()  { return MAX_ALBUM_SONGS;  }
}

module.exports = BaseRepository;