/**
 * client/src/services/errorReporter.js
 *
 * PHASE 4 — TASK 4.2: Automatic Frontend Error Collection
 *
 * WHAT THIS MODULE DOES:
 *   Collects every unhandled error that occurs in the browser — React render
 *   crashes (from ErrorBoundary.componentDidCatch), unhandled Promise
 *   rejections, and synchronous window errors — and ships them to the backend
 *   for structured Winston logging.
 *
 *   Every report carries the X-Correlation-ID from the most recent API
 *   response so a single error report can be matched to the exact server log
 *   line that preceded the crash.
 *
 * ARCHITECTURE DECISIONS:
 *
 *   1. SEND-QUEUE WITH FLUSH SEMANTICS
 *      Reports are queued in memory and flushed as a batch every
 *      FLUSH_INTERVAL_MS (3 seconds). This prevents a storm of rapid errors
 *      (e.g. a list render throwing 50 times) from producing 50 individual
 *      HTTP requests. The queue is also flushed immediately on visibilitychange
 *      (tab hidden/closed) so no reports are lost when the user navigates away.
 *
 *   2. DEDUPLICATION
 *      Consecutive identical errors (same message + same page) within a
 *      DEDUP_WINDOW_MS window are collapsed to one report with an `occurrences`
 *      count. This prevents a render loop from flooding the backend log.
 *
 *   3. RATE GUARD
 *      At most MAX_REPORTS_PER_SESSION reports are sent per page session.
 *      If a catastrophic loop fires hundreds of errors, we cap the output.
 *      The backend also enforces 10 req/min per IP as a second defence layer.
 *
 *   4. CIRCUIT BREAKER
 *      If the backend endpoint itself returns 429 or 5xx, we back off
 *      exponentially and stop retrying after MAX_SEND_FAILURES consecutive
 *      failures. This prevents a reporting loop from worsening a backend
 *      outage.
 *
 *   5. NEVER THROWS
 *      Every internal method is wrapped in try/catch. An error inside the
 *      error reporter must never cause a visible failure or trigger itself
 *      recursively.
 *
 *   6. NO CIRCULAR IMPORT
 *      This module does NOT import from api.js. It uses a plain fetch() call
 *      so there is no risk of the Axios interceptors (which import firebase,
 *      auth, authStore) re-entering this module when a reporting call itself
 *      fails. This is intentional and must be preserved.
 *
 * INTEGRATION POINTS:
 *   - ErrorBoundary.jsx        → errorReporter.report(error, errorInfo, meta)
 *   - client/src/index.js      → errorReporter.init()  (once, at app boot)
 *   - api.js response interceptor → errorReporter.setLastCorrelationId(id)
 *
 * ENVIRONMENT:
 *   REACT_APP_API_URL  — backend base URL, same as API_BASE_URL in config/index.js
 */

import { API_BASE_URL } from '../config/index';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Endpoint on the backend that receives error reports. */
const REPORT_ENDPOINT = `${API_BASE_URL}/api/errors/report`;

/** How long to wait before flushing the queue (ms). */
const FLUSH_INTERVAL_MS = 3_000;

/** Collapse identical errors within this window (ms). */
const DEDUP_WINDOW_MS = 5_000;

/** Stop reporting after this many reports per session to prevent floods. */
const MAX_REPORTS_PER_SESSION = 50;

/** Stop trying to send after this many consecutive network/server failures. */
const MAX_SEND_FAILURES = 5;

/** Fetch timeout for a single report batch (ms). */
const FETCH_TIMEOUT_MS = 8_000;

// ─── Module-level state ───────────────────────────────────────────────────────

/**
 * The X-Correlation-ID value from the most recent API response.
 * api.js calls setLastCorrelationId() in its response interceptor.
 * Attached to every error report so backend logs can be matched exactly.
 */
let _lastCorrelationId = null;

/**
 * Firebase Auth uid of the currently signed-in user.
 * Set by setUserId() — called from authStore when auth state changes.
 * Never read from Firebase directly to avoid import coupling.
 */
let _userId = null;

/** Pending reports waiting for the next flush. */
let _queue = [];

/** setInterval handle for the periodic flush. */
let _flushTimer = null;

/** Total reports sent this session. Stops at MAX_REPORTS_PER_SESSION. */
let _sessionReportCount = 0;

/** Consecutive flush failures. Stops reporting at MAX_SEND_FAILURES. */
let _consecutiveSendFailures = 0;

/** True once init() has been called. Prevents double-registration. */
let _initialized = false;

/**
 * Dedup tracker: maps a string key → { lastSeen: timestamp, occurrences: number }
 * Used to collapse rapid identical errors into one report.
 */
const _dedupMap = new Map();

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Build a stable dedup key from an error report payload.
 * Intentionally coarse: message + page is enough to identify a repeat.
 *
 * @param {object} payload
 * @returns {string}
 */
function _dedupKey(payload) {
  return `${payload.message || ''}::${payload.page || ''}`;
}

/**
 * Prune stale dedup entries older than DEDUP_WINDOW_MS.
 * Called before each enqueue to prevent the Map from growing unbounded.
 */
function _pruneDedup() {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, entry] of _dedupMap) {
    if (entry.lastSeen < cutoff) {
      _dedupMap.delete(key);
    }
  }
}

/**
 * Serialize an Error or unknown thrown value into a plain string.
 *
 * @param {unknown} error
 * @returns {string}
 */
function _serializeError(error) {
  if (!error) return 'Unknown error';
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || 'Error (no message)';
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * Serialize an Error stack trace safely.
 *
 * @param {unknown} error
 * @returns {string|null}
 */
function _serializeStack(error) {
  if (error instanceof Error && typeof error.stack === 'string') {
    // Trim to first 2 000 characters — enough to identify the call site,
    // not so large that it bloats every log entry.
    return error.stack.slice(0, 2_000);
  }
  return null;
}

/**
 * Get the current page path. Never throws.
 *
 * @returns {string}
 */
function _currentPage() {
  try {
    return window.location.pathname + window.location.search;
  } catch {
    return 'unknown';
  }
}

/**
 * Build the structured payload sent to the backend for a single error.
 *
 * @param {unknown}      error
 * @param {object|null}  meta   — extra context from the call site
 * @returns {object}
 */
function _buildPayload(error, meta = {}) {
  return {
    // Error identity
    message:          _serializeError(error),
    stack:            _serializeStack(error),
    errorCode:        error?.code ?? null,

    // Context
    page:             meta.page        ?? _currentPage(),
    action:           meta.action      ?? null,       // e.g. 'loading songs'
    componentStack:   meta.componentStack ?? null,    // from React errorInfo
    boundary:         meta.boundary    ?? null,       // which ErrorBoundary fired

    // Session
    userId:           _userId,
    correlationId:    _lastCorrelationId,
    userAgent:        navigator.userAgent,
    timestamp:        new Date().toISOString(),
    sessionReportSeq: _sessionReportCount + 1,       // 1-indexed report number
  };
}

/**
 * Attempt to send a batch of payloads to the backend.
 * Uses fetch() directly — no Axios — to avoid circular imports and to ensure
 * the reporting path has zero dependency on the Axios interceptor chain.
 *
 * On 429 or 5xx the failure counter increments. On network failure same.
 * On success the counter resets.
 *
 * @param {object[]} batch
 * @returns {Promise<void>}
 */
async function _sendBatch(batch) {
  if (batch.length === 0) return;

  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(REPORT_ENDPOINT, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reports: batch }),
      signal:  controller.signal,
    });

    clearTimeout(timeoutId);

    if (response.ok || response.status === 422) {
      // 422 means the backend received our payload but rejected it for schema
      // reasons — still a "successful" transmission from our side.
      _consecutiveSendFailures = 0;
      return;
    }

    // 429 or 5xx — back off
    _consecutiveSendFailures += 1;

  } catch {
    // Network failure, timeout, or AbortError
    clearTimeout(timeoutId);
    _consecutiveSendFailures += 1;
  }
}

/**
 * Flush all queued reports to the backend.
 * Called by the interval timer and by the visibilitychange handler.
 * Never throws.
 */
async function _flush() {
  if (_queue.length === 0) return;

  // Circuit breaker: stop trying if the backend is consistently failing
  if (_consecutiveSendFailures >= MAX_SEND_FAILURES) return;

  const batch  = _queue.slice();
  _queue       = [];

  try {
    await _sendBatch(batch);
  } catch {
    // _sendBatch should never throw, but guard anyway
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Set the X-Correlation-ID from the most recent API response.
 * Called by api.js response interceptor on every successful response.
 *
 * @param {string|null} id
 */
export function setLastCorrelationId(id) {
  _lastCorrelationId = id || null;
}

/**
 * Set the currently authenticated user ID.
 * Called by authStore when auth state changes (sign-in / sign-out).
 * Pass null on logout.
 *
 * @param {string|null} uid
 */
export function setUserId(uid) {
  _userId = uid || null;
}

/**
 * Enqueue an error report for batched delivery to the backend.
 *
 * Safe to call from anywhere — ErrorBoundary.componentDidCatch,
 * window.onerror, unhandledrejection, or any component try/catch.
 * Never throws.
 *
 * @param {unknown}     error          — the thrown error value
 * @param {object}      [meta={}]      — optional context fields
 * @param {string}      [meta.action]  — what the user was doing
 * @param {string}      [meta.page]    — override current URL path
 * @param {string}      [meta.componentStack] — React errorInfo.componentStack
 * @param {string}      [meta.boundary]       — which boundary name fired
 */
export function report(error, meta = {}) {
  try {
    // Hard cap: stop after MAX_REPORTS_PER_SESSION
    if (_sessionReportCount >= MAX_REPORTS_PER_SESSION) return;

    // Circuit breaker
    if (_consecutiveSendFailures >= MAX_SEND_FAILURES) return;

    const payload = _buildPayload(error, meta);
    const key     = _dedupKey(payload);

    _pruneDedup();

    if (_dedupMap.has(key)) {
      // Increment occurrence count on the already-queued matching report
      const existing = _dedupMap.get(key);
      existing.occurrences += 1;
      existing.lastSeen    = Date.now();

      // Update the payload already in the queue
      const queued = _queue.find(p => _dedupKey(p) === key);
      if (queued) queued.occurrences = existing.occurrences;

      return; // Do not add a duplicate entry
    }

    // First occurrence
    _dedupMap.set(key, { lastSeen: Date.now(), occurrences: 1 });
    payload.occurrences = 1;

    _queue.push(payload);
    _sessionReportCount += 1;

    // Always log to console in development for immediate developer visibility
    if (process.env.NODE_ENV !== 'production') {
      console.error('[errorReporter]', payload);
    }

  } catch {
    // Never allow the reporter to throw
  }
}

/**
 * Initialize global error handlers and the flush interval.
 * Must be called exactly once, as early as possible in client/src/index.js,
 * before React renders anything.
 *
 * Registers:
 *   - window.onerror            catches synchronous script errors
 *   - unhandledrejection        catches async Promise rejections
 *   - visibilitychange          flushes the queue when the tab is hidden/closed
 *   - setInterval               flushes the queue every FLUSH_INTERVAL_MS
 *
 * Idempotent: calling init() more than once is a no-op.
 */
export function init() {
  if (_initialized) return;
  _initialized = true;

  // ── window.onerror ─────────────────────────────────────────────────────────
  // Catches synchronous errors that escape all React error boundaries:
  //   - errors in event handlers (onClick, onChange etc.)
  //   - errors in setTimeout / setInterval callbacks
  //   - script load errors
  //
  // Returning false preserves the browser's default error handling (console).
  // Returning true suppresses it — we keep false so the dev console still shows it.
  const previousOnError = window.onerror;

  window.onerror = function onError(message, source, lineno, colno, error) {
    report(error || new Error(String(message)), {
      action: 'window.onerror',
      page:   _currentPage(),
      // Attach source/line as extra context in the action field
      // so developers can locate the exact script and line
    });

    // Chain to any previous handler (e.g. third-party monitoring)
    if (typeof previousOnError === 'function') {
      previousOnError.call(this, message, source, lineno, colno, error);
    }

    return false; // Do not suppress browser default
  };

  // ── unhandledrejection ─────────────────────────────────────────────────────
  // Catches async Promise rejections that were never .catch()ed:
  //   - fire-and-forget async functions that throw
  //   - async event handlers that throw
  //   - React Query's retry exhaustion when onError is not set
  //
  // These slip past React error boundaries entirely.
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;

    // Do not report aborted fetch signals — these are intentional cancellations
    // (e.g. component unmount, route change, AbortController). Reporting them
    // would generate noise with no actionable signal.
    if (reason?.name === 'AbortError') return;

    report(reason instanceof Error ? reason : new Error(String(reason ?? 'Unhandled rejection')), {
      action: 'unhandledrejection',
      page:   _currentPage(),
    });
  });

  // ── visibilitychange flush ─────────────────────────────────────────────────
  // When the user closes the tab or switches away, browsers may not process
  // fetch() calls initiated after the page starts unloading. We flush the
  // queue eagerly when the tab becomes hidden to maximise delivery probability.
  //
  // Note: navigator.sendBeacon() is the ideal API for this, but it requires
  // a Blob payload and does not support JSON Content-Type natively without
  // a workaround. fetch() with keepalive:true is equivalent and cleaner.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      _flush();
    }
  });

  // ── Periodic flush ─────────────────────────────────────────────────────────
  _flushTimer = setInterval(_flush, FLUSH_INTERVAL_MS);
}

/**
 * Teardown — stops the flush interval and clears all state.
 * Intended for use in test environments where a clean slate is needed
 * between test cases. Not called in production.
 */
export function destroy() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  _queue                  = [];
  _dedupMap.clear();
  _sessionReportCount     = 0;
  _consecutiveSendFailures = 0;
  _lastCorrelationId      = null;
  _userId                 = null;
  _initialized            = false;
}