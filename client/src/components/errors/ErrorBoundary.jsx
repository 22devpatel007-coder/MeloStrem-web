/**
 * client/src/components/errors/ErrorBoundary.jsx
 *
 * PHASE 1 — TASK 1.3: Three-Level Error Boundary Strategy
 * PHASE 4 — TASK 4.2: componentDidCatch now calls errorReporter.report()
 *
 * WHY THIS EXISTS:
 *   React 18 without error boundaries unmounts the entire component tree
 *   when any component throws during render. At 10,000+ songs with varied
 *   metadata quality, a single malformed song object will cause a render
 *   crash. Without boundaries this crashes the app for ALL users.
 *
 * THREE BOUNDARIES — each isolates a different failure scope:
 *
 *   AppErrorBoundary     — outermost shell. Catches catastrophic failures
 *                          that escape both inner boundaries. Shows full-page
 *                          recovery UI. Last resort.
 *
 *   PlayerErrorBoundary  — wraps MusicPlayer only. If the player crashes
 *                          (malformed audio URL, bad song object, audio API
 *                          failure), only the player bar is affected.
 *                          Navigation and song data remain fully functional.
 *
 *   PageErrorBoundary    — wraps the <main> scroll region inside PageWrapper.
 *                          If a page component crashes (bad song metadata,
 *                          null artist ID, etc.), only that page shows an
 *                          error state. Sidebar, player, and nav remain live.
 *
 * RESET MECHANISM:
 *   Each boundary exposes a "Try again" button that calls
 *   this.setState({ hasError: false, error: null }) — no full page refresh.
 *   React will re-attempt rendering the subtree from scratch.
 *
 * ERROR REPORTING (Task 4.2):
 *   componentDidCatch calls errorReporter.report() with:
 *     - the thrown error object
 *     - React's componentStack (which component in the tree threw)
 *     - the boundary name (AppErrorBoundary / PlayerErrorBoundary / PageErrorBoundary)
 *     - the current page URL path
 *   The reporter batches and ships these to POST /api/errors/report.
 *   The X-Correlation-ID from the most recent API response is attached
 *   automatically inside errorReporter so the backend log can be matched.
 *
 * WHAT DOES NOT CHANGE:
 *   - No existing component is modified here — only App.jsx and
 *     PageWrapper.jsx add boundary wrappers (see those files).
 *   - Class component is required — React error boundaries cannot be
 *     implemented as function components (as of React 18).
 *   - All design tokens match colors.css (--color-bg, --color-surface,
 *     --color-accent, --color-danger, --color-text-*).
 */

import { Component } from 'react';
import ErrorState from './ErrorState';
import { report as reportError } from '../../services/errorReporter';

// ─── Base ErrorBoundary class ─────────────────────────────────────────────────
//
// All three boundary variants extend this class.
// Subclasses override: variant, title, message, showHomeButton.
//
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.handleReset = this.handleReset.bind(this);
  }

  // React calls this during the render phase to derive error state.
  // Must be static — no side effects allowed here.
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  // React calls this after the render phase (commit) with full error info.
  // Safe to call side effects (logging, reporting) here.
  componentDidCatch(error, errorInfo) {
    const { onError } = this.props;

    // ── Phase 4 Task 4.2: structured error reporting ──────────────────────
    // reportError() is fire-and-forget — it queues the payload internally
    // and never throws. The boundary's fallback render is unaffected even
    // if the reporter itself encounters an issue.
    //
    // meta fields:
    //   boundary       — which boundary caught this (for server-side grouping)
    //   componentStack — the React component stack from errorInfo
    //   action         — fixed label so backend can filter boundary events
    //
    reportError(error, {
      boundary:       this.constructor.name,
      componentStack: errorInfo?.componentStack ?? null,
      action:         'react-error-boundary',
    });

    // Allow parent to hook in with the raw error + errorInfo if needed.
    // Used by tests and any future parent-level monitoring wrappers.
    if (typeof onError === 'function') {
      onError(error, errorInfo);
    }
  }

  // Resets boundary state — React will re-attempt rendering the subtree.
  // No page refresh required.
  handleReset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    const { hasError } = this.state;
    const { children, fallback } = this.props;

    if (!hasError) return children;

    // Allow fully custom fallback UI via prop (useful in tests).
    if (fallback) return fallback;

    // Subclass-driven fallback (variant controls ErrorState appearance).
    return (
      <ErrorState
        variant={this.variant}
        title={this.title}
        message={this.message}
        actionLabel="Try again"
        onAction={this.handleReset}
        showHomeButton={this.showHomeButton}
      />
    );
  }
}

// Set safe defaults on the base class prototype.
// Subclasses override these to customise the fallback UI.
ErrorBoundary.prototype.variant        = 'page';
ErrorBoundary.prototype.title          = 'Something went wrong';
ErrorBoundary.prototype.message        = 'An unexpected error occurred.';
ErrorBoundary.prototype.showHomeButton = false;


// ─── AppErrorBoundary ─────────────────────────────────────────────────────────
//
// Usage: wraps the entire app shell in App.jsx.
// Triggered by: catastrophic failures that escape both inner boundaries.
// Fallback: full-page recovery UI — user can retry or go home.
// When this fires it means something very unexpected happened.
//
export class AppErrorBoundary extends ErrorBoundary {}

AppErrorBoundary.prototype.variant        = 'app';
AppErrorBoundary.prototype.title          = 'MeloStream ran into a problem';
AppErrorBoundary.prototype.message        = 'Something unexpected happened. Refresh the page or go back to the library.';
AppErrorBoundary.prototype.showHomeButton = true;


// ─── PlayerErrorBoundary ─────────────────────────────────────────────────────
//
// Usage: wraps <MusicPlayer /> in App.jsx.
// Triggered by: malformed song object, audio API crash, bad cover URL.
// Fallback: minimal "Playback unavailable" bar — navigation is unaffected.
// The page content, sidebar, and nav remain fully functional.
//
export class PlayerErrorBoundary extends ErrorBoundary {}

PlayerErrorBoundary.prototype.variant        = 'player';
PlayerErrorBoundary.prototype.title          = 'Playback unavailable';
PlayerErrorBoundary.prototype.message        = 'The player ran into a problem. Your library and navigation still work.';
PlayerErrorBoundary.prototype.showHomeButton = false;


// ─── PageErrorBoundary ───────────────────────────────────────────────────────
//
// Usage: wraps the <main> scroll region inside PageWrapper.jsx.
// Triggered by: bad song metadata, null artist/album ID, broken page component.
// Fallback: error state inside the content area only.
// Sidebar, player bar, and mobile nav remain fully functional.
//
export class PageErrorBoundary extends ErrorBoundary {}

PageErrorBoundary.prototype.variant        = 'page';
PageErrorBoundary.prototype.title          = 'This page ran into a problem';
PageErrorBoundary.prototype.message        = 'We couldn\'t load this page. Your player and navigation are unaffected.';
PageErrorBoundary.prototype.showHomeButton = true;


// ─── Default export ───────────────────────────────────────────────────────────
// Export base class as default for custom one-off use cases.
export default ErrorBoundary;