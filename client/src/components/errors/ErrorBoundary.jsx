/**
 * client/src/components/errors/ErrorBoundary.jsx
 *
 * PHASE 1 — TASK 1.3: Three-Level Error Boundary Strategy
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
 * LOGGING:
 *   componentDidCatch logs structured info to console.error now.
 *   When Phase 4 (Task 4.2) adds errorReporter.js, replace the
 *   console.error call in componentDidCatch with errorReporter.report().
 *   The signature is already prepared — no other changes needed.
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

    // Structured log for developer diagnosis.
    // Phase 4 Task 4.2: replace console.error with errorReporter.report({...})
    console.error('[ErrorBoundary]', {
      boundary:     this.constructor.name,
      message:      error?.message,
      stack:        error?.stack,
      componentStack: errorInfo?.componentStack,
    });

    // Allow parent to hook in (used by Phase 4 errorReporter integration).
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