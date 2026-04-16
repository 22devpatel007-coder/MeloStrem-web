/**
 * client/src/components/errors/NetworkErrorBanner.jsx
 *
 * PHASE 4 — TASK 4.4: Consistent Error UI Components
 *
 * WHAT THIS IS:
 *   A fixed top-of-screen banner that appears when the browser detects
 *   the user is offline. It disappears automatically when connectivity
 *   is restored. Prevents user confusion when API calls fail due to
 *   network loss, not application bugs.
 *
 * HOW IT WORKS:
 *   1. Reads navigator.onLine at mount for initial state.
 *   2. Listens to window 'online' / 'offline' events for live updates.
 *   3. Cleans up listeners on unmount — no memory leaks.
 *   4. Uses a short CSS slide-down animation on show, slide-up on hide.
 *   5. Returns null when online — zero DOM footprint when not needed.
 *
 * WHERE TO MOUNT:
 *   Inside App.jsx, at the top of the JSX tree (above PageWrapper /
 *   AppRoutes), but inside ToastProvider. It uses a portal to render
 *   directly into document.body so it is never clipped by any overflow
 *   container or z-index stacking context from the app shell.
 *
 * LAYOUT CONTRACT:
 *   - position: fixed, top: 0, left: 0, right: 0
 *   - z-index: 10000  (above toasts at 9999, above modals at 50)
 *   - Height: 40px (desktop) / 44px (mobile, touch-friendly)
 *   - Does NOT push layout down — overlay pattern, not document-flow banner
 *   - PageWrapper already owns scrollable regions; this is purely cosmetic overlay
 *
 * ACCESSIBILITY:
 *   - role="alert" so screen readers immediately announce the offline state.
 *   - aria-live="assertive" for network loss (urgent).
 *   - aria-live="polite" for reconnection (less disruptive).
 *   - Dismiss button has explicit aria-label.
 *   - Keyboard accessible (focus-visible ring).
 *
 * WHAT DOES NOT CHANGE:
 *   - No existing component is modified. Mount this in App.jsx.
 *   - Does not interfere with MusicPlayer, ToastProvider, or ErrorBoundary.
 *   - z-index: 10000 is a deliberate choice above everything else in the system.
 */

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

// ── NetworkErrorBanner ────────────────────────────────────────────────────────

/**
 * Drop this once anywhere in App.jsx (inside JSX, outside AppRoutes).
 * No props needed — it is entirely self-contained.
 *
 * @example
 * // App.jsx
 * import NetworkErrorBanner from './components/errors/NetworkErrorBanner';
 *
 * const App = () => (
 *   <ToastProvider>
 *     <NetworkErrorBanner />
 *     <BrowserRouter>
 *       ...
 *     </BrowserRouter>
 *   </ToastProvider>
 * );
 */
const NetworkErrorBanner = () => {
  // ── State ───────────────────────────────────────────────────────────────────
  // isOnline: current actual connectivity state
  // justReconnected: true for 3 seconds after recovering — shows a "back online" message
  // dismissed: user explicitly closed the offline banner
  const [isOnline,         setIsOnline]         = useState(() => navigator.onLine);
  const [justReconnected,  setJustReconnected]  = useState(false);
  const [dismissed,        setDismissed]        = useState(false);

  // ── Event handlers ──────────────────────────────────────────────────────────
  const handleOnline = useCallback(() => {
    setIsOnline(true);
    setDismissed(false);      // Reset dismiss so banner can show "back online"
    setJustReconnected(true);

    // Auto-hide the "back online" confirmation after 3 seconds
    const id = setTimeout(() => setJustReconnected(false), 3000);
    return () => clearTimeout(id);
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setJustReconnected(false);
    setDismissed(false);      // Reset dismiss so the offline banner shows again
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
  }, []);

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  useEffect(() => {
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online',  handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  // ── Render logic ────────────────────────────────────────────────────────────
  // Nothing to show: online and not in the "just reconnected" window
  const showOffline     = !isOnline && !dismissed;
  const showReconnected = isOnline && justReconnected;

  if (!showOffline && !showReconnected) return null;

  // ── Portal render ───────────────────────────────────────────────────────────
  return createPortal(
    <>
      <style>{BANNER_STYLES}</style>
      <div
        className={[
          'neb-banner',
          showOffline     ? 'neb-banner--offline'     : '',
          showReconnected ? 'neb-banner--reconnected' : '',
        ].filter(Boolean).join(' ')}
        role="alert"
        aria-live={showOffline ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {/* Left: icon */}
        <span className="neb-banner__icon" aria-hidden="true">
          {showOffline ? <OfflineIcon /> : <OnlineIcon />}
        </span>

        {/* Center: message */}
        <span className="neb-banner__text">
          {showOffline
            ? 'No internet connection — some features may not work'
            : 'Back online'}
        </span>

        {/* Right: dismiss (only for offline — reconnected auto-hides) */}
        {showOffline && (
          <button
            className="neb-banner__dismiss"
            onClick={handleDismiss}
            aria-label="Dismiss offline notification"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </>,
    document.body,
  );
};

// ── Icons — inline SVG, zero external dependency ──────────────────────────────

const OfflineIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

const OnlineIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const CloseIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6"  y1="6" x2="18" y2="18" />
  </svg>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const BANNER_STYLES = `
  .neb-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    height: 40px;
    font-family: var(--font-family, 'Inter', -apple-system, sans-serif);
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    pointer-events: all;
    will-change: transform, opacity;
    /* Prevent text selection during banner animations */
    user-select: none;
  }

  /* ── Offline state — amber/warning tone ─── */
  .neb-banner--offline {
    background-color: rgba(161, 98, 7, 0.96);
    color: #fffbeb;
    border-bottom: 1px solid rgba(245, 158, 11, 0.3);
    backdrop-filter: blur(8px);
    animation: neb-slide-down 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  /* ── Reconnected state — green/success tone ─── */
  .neb-banner--reconnected {
    background-color: rgba(21, 128, 61, 0.96);
    color: #f0fdf4;
    border-bottom: 1px solid rgba(34, 197, 94, 0.3);
    backdrop-filter: blur(8px);
    animation:
      neb-slide-down 0.25s cubic-bezier(0.34, 1.56, 0.64, 1) forwards,
      neb-fade-out 0.3s ease 2.7s forwards;
  }

  @keyframes neb-slide-down {
    from { transform: translateY(-100%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  @keyframes neb-fade-out {
    from { opacity: 1; transform: translateY(0); }
    to   { opacity: 0; transform: translateY(-100%); }
  }

  .neb-banner__icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.9;
  }

  .neb-banner__text {
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .neb-banner__dismiss {
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: rgba(255, 251, 235, 0.7);
    cursor: pointer;
    padding: 6px;
    border-radius: 4px;
    flex-shrink: 0;
    transition: color 0.15s, background 0.15s;
    line-height: 1;
    min-width: 28px;
    min-height: 28px;
  }

  .neb-banner__dismiss:hover {
    color: #fff;
    background: rgba(255, 255, 255, 0.12);
  }

  .neb-banner__dismiss:focus-visible {
    outline: 2px solid rgba(255, 255, 255, 0.6);
    outline-offset: 2px;
  }

  /* ── Mobile: taller for touch targets ─── */
  @media (max-width: 768px) {
    .neb-banner {
      height: 44px;
      font-size: 12.5px;
    }
    .neb-banner__dismiss {
      min-width: 36px;
      min-height: 36px;
    }
  }

  /* ── Very small screens: shorter text ─── */
  @media (max-width: 400px) {
    .neb-banner__text {
      font-size: 12px;
    }
  }
`;

export default NetworkErrorBanner;