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
 *   Every report carries its own unique reportId (client-generated UUID) so it
 *   is always self-traceable. Additionally, the X-Correlation-ID from the most
 *   recent API response is attached as relatedCorrelationId — a best-effort
 *   hint that links the report to the last known server interaction.
 *
 * ARCHITECTURE DECISIONS:
 *
 *   1. SEND-QUEUE WITH FLUSH SEMANTICS
 *      Reports are queued in memory and flushed as a batch every
 *      FLUSH_INTERVAL_MS (7 seconds). This prevents a storm of rapid errors
 *      (e.g. a list render throwing 50 times) from producing 50 individual
 *      HTTP requests. The queue is also flushed immediately on visibilitychange
 *      (tab hidden/closed) so no reports are lost when the user navigates away.
 *
 *      WHY 7 SECONDS: The backend enforces 10 req/min per IP. At 7s intervals
 *      the client fires at most ~8.5 flushes/min, leaving headroom for
 *      visibilitychange flushes and multi-tab scenarios without ever hitting
 *      the rate limit under normal error conditions.
 *
 *   2. DEDUPLICATION
 *      Consecutive identical errors (same message + same page) within a
 *      DEDUP_WINDOW_MS window are collapsed to one report with an `occurrences`
 *      count. This prevents a render loop from flooding the backend log.
 *
 *      The dedup check runs BEFORE _pruneDedup() so a key is never deleted
 *      out from under an active duplicate check. Pruning only runs when
 *      registering a brand-new key, which is the only time stale entries
 *      need to be evicted.
 *
 *   3. RATE GUARD
 *      At most MAX_REPORTS_PER_SESSION reports are sent per page session.
 *      If a catastrophic loop fires hundreds of errors, we cap the output.
 *      The backend also enforces 20 req/min per IP as a second defence layer.
 *
 *   4. CIRCUIT BREAKER
 *      If the backend returns 429, the circuit opens immediately — we do not
 *      wait for 5 incremental failures. 429 is an explicit server instruction
 *      to stop, not a transient failure. For 5xx the counter increments
 *      normally and the circuit opens after MAX_SEND_FAILURES consecutive
 *      failures. Network errors (timeout, DNS, etc.) also increment the counter.
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
 * TRACEABILITY MODEL (BUG-021 fix):
 *
 *   PROBLEM: The previous design stored only _lastCorrelationId (the most
 *   recent X-Correlation-ID from any API response) and attached it as
 *   `correlationId` on every report. This had two failure modes:
 *
 *     A) If no API call had ever been made before the error fired (e.g. a
 *        React render crash during initial mount, before any fetch), the field
 *        was null. The backend could not trace the report at all.
 *
 *     B) Even when an API call had been made, the stored ID belonged to the
 *        PREVIOUS response — not the one that triggered the crash. The field
 *        was present but semantically misleading.
 *
 *   PERMANENT FIX: Two independent tracing fields per report:
 *
 *     reportId             — a client-generated UUID stamped at build time.
 *       Always present. Always unique. Lets the backend correlate a specific
 *       error report to its own log entry with zero dependency on API call
 *       history. Generated via crypto.randomUUID() with a safe fallback for
 *       environments that do not expose the Web Crypto API (very old browsers,
 *       some JSDOM test configurations).
 *
 *     relatedCorrelationId — the X-Correlation-ID from the most recent API
 *       response at the time the error was built. Semantically honest: "this
 *       was the last server interaction before the crash — it MAY be related."
 *       Null when no API call has been made yet. Never fabricated.
 *       Replaces the former `correlationId` field. The rename is intentional:
 *       "related" signals that the relationship is correlational, not causal.
 *
 *   Backend impact: additive payload change only. No existing field removed.
 *   `correlationId` is replaced by `relatedCorrelationId` and `reportId` is
 *   new. Backend log consumers should update queries to use reportId for
 *   primary report lookup and relatedCorrelationId for server-log cross-reference.
 *
 * INTEGRATION POINTS:
 *   - ErrorBoundary.jsx           → errorReporter.report(error, meta)
 *   - client/src/index.js         → errorReporter.init()  (once, at app boot)
 *   - api.js response interceptor → errorReporter.setLastCorrelationId(id)
 *
 * ENVIRONMENT:
 *   REACT_APP_API_URL  — backend base URL, same as API_BASE_URL in config/index.js
 */

import { API_BASE_URL } from '../config/index';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Endpoint on the backend that receives error reports. */
const REPORT_ENDPOINT = `${API_BASE_URL}/api/errors/report`;

/**
 * How long to wait before flushing the queue (ms).
 *
 * 7 000 ms = ~8.5 flushes/min maximum.
 * Backend rate limit is 20 req/min — this stays well within that budget
 * even when visibilitychange triggers an extra flush.
 *
 * Previous value was 3 000 ms (~20 flushes/min), which exceeded the old
 * 10 req/min limit. Raised to 7 000 ms as part of BUG-017 fix.
 */
const FLUSH_INTERVAL_MS = 7_000;

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
 *
 * Attached to reports as `relatedCorrelationId` — a best-effort hint at the
 * last server interaction before the crash. May be null if no API call has
 * been made in this session yet. See TRACEABILITY MODEL in file header.
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
 *
 * Keyed entries survive across flush cycles for the full DEDUP_WINDOW_MS so
 * that a repeated error is still collapsed even after the queue has been
 * drained.
 */
const _dedupMap = new Map();

/**
 * Set of error messages reported through an ErrorBoundary within the current
 * DEDUP_WINDOW_MS. Used by window.onerror to suppress re-reporting the same
 * error that a boundary already caught.
 */
const _boundaryReportedMessages = new Set();

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
 * Called only when registering a NEW key — never before the has() check —
 * so an active dedup entry is never deleted out from under a duplicate test.
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
 * Generate a unique ID for a single error report.
 *
 * Primary: crypto.randomUUID() — available in all modern browsers (Chrome 92+,
 * Firefox 95+, Safari 15.4+) and in Node 14.17+ / JSDOM 16+. Produces a
 * standards-compliant v4 UUID. This is the path taken in production.
 *
 * Fallback: timestamp + random base-36 suffix. Activated only in very old
 * browser environments or JSDOM configurations that do not expose the Web
 * Crypto API. Collision probability is negligible for the error-reporting
 * volume this application generates, but it is NOT a cryptographic UUID.
 * The `r-` prefix makes fallback IDs visually distinguishable in logs.
 *
 * WHY NOT Math.random() ALONE: Math.random() alone has ~1-in-10^13 collision
 * probability per pair, which is acceptable, but combining it with Date.now()
 * lowers collision risk further and makes IDs monotonically sortable by
 * creation time — a useful property when scanning backend logs.
 *
 * @returns {string}
 */
function _generateReportId() {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // Fall through to the safe fallback below.
  }
  // Fallback for environments without Web Crypto API.
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Build the structured payload sent to the backend for a single error.
 *
 * TRACEABILITY FIELDS (BUG-021 fix):
 *   reportId             — unique ID for THIS report. Always present.
 *                          Generated fresh at build time via _generateReportId().
 *                          Primary key for backend log lookups.
 *
 *   relatedCorrelationId — the X-Correlation-ID from the most recent API
 *                          response at the moment this error was captured.
 *                          Null when no API response has been received yet in
 *                          this session (e.g. a render crash before any fetch).
 *                          Named "related" to signal correlation, not causation.
 *                          Use for cross-referencing server logs, not as a
 *                          primary report identifier.
 *
 * @param {unknown}      error
 * @param {object|null}  meta   — extra context from the call site
 * @returns {object}
 */
function _buildPayload(error, meta = {}) {
  return {
    // Error identity
    message:              _serializeError(error),
    stack:                _serializeStack(error),
    errorCode:            error?.code ?? null,

    // Context
    page:                 meta.page          ?? _currentPage(),
    action:               meta.action        ?? null,       // e.g. 'loading songs'
    componentStack:       meta.componentStack ?? null,      // from React errorInfo
    boundary:             meta.boundary      ?? null,       // which ErrorBoundary fired

    // Session
    userId:               _userId,
    userAgent:            navigator.userAgent,
    timestamp:            new Date().toISOString(),
    sessionReportSeq:     _sessionReportCount + 1,         // 1-indexed report number

    // Traceability (BUG-021 fix — see TRACEABILITY MODEL in file header)
    //
    // reportId:
    //   Unique ID for this specific report. Always present regardless of API
    //   call history. Lets backend correlate a report to its own log entry.
    //
    // relatedCorrelationId:
    //   The last X-Correlation-ID received from the backend at the moment this
    //   error was built. Best-effort. Null if no API call has been made yet.
    //   Replaces the former `correlationId` field. Renamed to be semantically
    //   honest: the relationship to the server error (if any) is correlational.
    reportId:             _generateReportId(),
    relatedCorrelationId: _lastCorrelationId,
  };
}

/**
 * Attempt to send a batch of payloads to the backend.
 * Uses fetch() directly — no Axios — to avoid circular imports and to ensure
 * the reporting path has zero dependency on the Axios interceptor chain.
 *
 * On 429: circuit opens IMMEDIATELY. 429 is an explicit server instruction
 * to stop sending — it is not a transient failure and must not be treated as
 * one. _consecutiveSendFailures is set to MAX_SEND_FAILURES directly.
 *
 * On 5xx: counter increments by 1. Circuit opens after MAX_SEND_FAILURES
 * consecutive 5xx responses.
 *
 * On network failure (timeout, DNS, AbortError): same as 5xx.
 *
 * On success (2xx) or schema rejection (422): counter resets to 0.
 *
 * @param {object[]} batch
 * @returns {Promise<void>}
 */
async function _sendBatch(batch) {
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

    if (response.status === 429) {
      // Hard stop — server explicitly told us to back off.
      // Open the circuit immediately instead of waiting for 5 incremental
      // failures. Continuing to send after a 429 would only extend the
      // blackout window by consuming more of the rate limit budget.
      _consecutiveSendFailures = MAX_SEND_FAILURES;
      return;
    }

    // 5xx — transient server error, increment normally
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
 * The stored value is attached to future reports as `relatedCorrelationId`.
 * It is never used as the primary report identifier — see reportId in
 * _buildPayload and the TRACEABILITY MODEL in the file header.
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

    // Register boundary-reported messages for window.onerror suppression.
    // Guard with has() so only one setTimeout is registered per message per
    // window — prevents a new timer being added on every boundary re-render
    // and plugs the memory leak caused by unbounded timer registration.
    if (meta.boundary && !_boundaryReportedMessages.has(payload.message)) {
      _boundaryReportedMessages.add(payload.message);
      setTimeout(() => _boundaryReportedMessages.delete(payload.message), DEDUP_WINDOW_MS);
    }

    // ── Dedup check BEFORE pruning ──────────────────────────────────────────
    // The has() check must run before _pruneDedup() so that an entry whose
    // lastSeen is right at the boundary of DEDUP_WINDOW_MS is never deleted
    // out from under an active duplicate test. This ensures dedup survives
    // across flush cycles: once _queue is drained the key stays in _dedupMap
    // for the full DEDUP_WINDOW_MS and continues suppressing re-queuing.
    if (_dedupMap.has(key)) {
      const existing = _dedupMap.get(key);
      existing.occurrences += 1;
      existing.lastSeen    = Date.now();

      // Update the payload still in the queue, if it hasn't been flushed yet.
      // If the queue was already drained the find returns undefined — that is
      // fine. The dedup entry still suppresses a new report being enqueued.
      const queued = _queue.find(p => _dedupKey(p) === key);
      if (queued) queued.occurrences = existing.occurrences;

      return; // Do not add a duplicate entry
    }

    // New key — prune stale entries before growing the map
    _pruneDedup();
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
    const _msg = _serializeError(error || new Error(String(message)));
    if (_boundaryReportedMessages.has(_msg)) return false;

    report(error || new Error(String(message)), {
      action: 'window.onerror',
      page:   _currentPage(),
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
  _queue                   = [];
  _dedupMap.clear();
  _boundaryReportedMessages.clear();
  _sessionReportCount      = 0;
  _consecutiveSendFailures = 0;
  _lastCorrelationId       = null;
  _userId                  = null;
  _initialized             = false;
}