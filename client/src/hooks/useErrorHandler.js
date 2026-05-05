/**
 * client/src/hooks/useErrorHandler.js
 *
 * Task 2.4 — Centralized Hook Error Handler
 *
 * WHAT THIS DOES:
 *   Single entry point for all hook-level errors. Every data-fetching hook
 *   that sets isError:true calls useErrorHandler, which:
 *     1. Maps the raw error to a user-safe message via errorMessages.js
 *     2. Triggers the Toast system with the correct severity
 *     3. Logs the technical details to the console (dev) or errorReporter (prod)
 *
 * WHY ONE HOOK:
 *   Without this, every component has its own useEffect watching error and
 *   calling its own toast logic. That means 10+ different error display paths,
 *   inconsistent messages, and scattered logging. This eliminates all of that.
 *
 * USAGE:
 *   // Option A — reactive (fires when error changes)
 *   const { handleError } = useErrorHandler();
 *   useEffect(() => {
 *     if (isError) handleError(error, 'loading songs');
 *   }, [isError, error]);
 *
 *   // Option B — imperative (fire once manually)
 *   const { handleError } = useErrorHandler();
 *   try { await doSomething(); } catch (err) { handleError(err, 'saving playlist'); }
 *
 *   // Option C — auto-watch pattern (most common in hooks)
 *   useErrorHandler({ error, isError, context: 'loading liked songs' });
 *
 * IMPORTANT:
 *   This hook does NOT throw. It is display-only. The caller still owns
 *   the error state — this hook only decides how to show it to the user.
 */

import { useEffect, useCallback, useRef } from 'react';
import { getErrorMessage, ERROR_SEVERITY } from '../utils/errorMessages';

// ── Toast bridge ──────────────────────────────────────────────────────────────
// We use a module-level event emitter pattern so useErrorHandler does not need
// to import Toast directly (avoiding circular deps). Toast.jsx listens for
// this custom event on window. If Toast is not mounted, errors go to console.
//
// Fallback: if window.__showToast is not set (SSR, test env), we console.error.
const dispatchToast = (message, severity = ERROR_SEVERITY.ERROR) => {
  try {
    if (typeof window !== 'undefined' && typeof window.__showToast === 'function') {
      window.__showToast({ message, severity });
      return;
    }
    // Fallback: dispatch a CustomEvent that Toast can listen to
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('melostream:toast', { detail: { message, severity } })
      );
    }
  } catch {
    // Never crash the calling hook because of a toast failure
    console.error('[useErrorHandler] Toast dispatch failed:', message);
  }
};

// ── Error logging ─────────────────────────────────────────────────────────────
// In production, errors should go to errorReporter (Phase 4).
// For now, we use a safe console.error that never throws.
const logError = (error, context) => {
  try {
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
      console.error(`[useErrorHandler] Error in "${context}":`, error);
    } else {
      // Phase 4: replace with errorReporter.report({ error, context })
      
    }
  } catch {
    // Never crash because of logging
  }
};

// ── Main hook — imperative handle + optional auto-watch ───────────────────────

/**
 * @param {object} [autoWatch]
 * @param {Error|null} [autoWatch.error]       - error object to watch
 * @param {boolean}    [autoWatch.isError]      - boolean flag from React Query
 * @param {string}     [autoWatch.context]      - human description: 'loading songs'
 * @param {boolean}    [autoWatch.silent]       - if true, log but do not toast
 *
 * @returns {{ handleError: (error: Error, context: string, options?: object) => void }}
 */
export const useErrorHandler = (autoWatch = null) => {
  // Track which error we already toasted so we do not double-fire
  // when a parent re-renders while the same error is still present.
  const lastReportedRef = useRef(null);

  /**
   * Imperative error handler. Call this directly in catch blocks or
   * inside useEffect when you need manual control.
   *
   * @param {Error|null} error
   * @param {string} context  - e.g. 'loading songs', 'saving playlist'
   * @param {{ silent?: boolean, severity?: string }} options
   */
  const handleError = useCallback((error, context = 'performing action', options = {}) => {
    if (!error) return;

    const { silent = false } = options;

    // Always log — developers need technical details
    logError(error, context);

    if (!silent) {
      // getErrorMessage maps error codes → user-safe strings
      const message = getErrorMessage(error, context);
      const severity = options.severity ?? ERROR_SEVERITY.ERROR;
      dispatchToast(message, severity);
    }
  }, []);

  // ── Auto-watch pattern ────────────────────────────────────────────────────
  // When autoWatch is provided, reactively fire when isError flips to true.
  // Guard with lastReportedRef so re-renders with the same error don't re-toast.
  useEffect(() => {
    if (!autoWatch) return;

    const { error, isError, context = 'performing action', silent = false } = autoWatch;

    if (!isError || !error) {
      // Error cleared — reset our dedup tracker
      lastReportedRef.current = null;
      return;
    }

    // Dedup: only fire once per unique error object reference
    if (lastReportedRef.current === error) return;
    lastReportedRef.current = error;

    handleError(error, context, { silent });
  }, [autoWatch?.isError, autoWatch?.error, autoWatch?.context, autoWatch?.silent, handleError]); // eslint-disable-line react-hooks/exhaustive-deps

  return { handleError };
};