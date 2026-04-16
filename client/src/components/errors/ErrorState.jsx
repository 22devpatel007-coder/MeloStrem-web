/**
 * client/src/components/errors/ErrorState.jsx
 *
 * PHASE 4 — TASK 4.4: Consistent Error UI Components
 *
 * WHAT THIS IS:
 *   A single, reusable error/empty-state component used by:
 *     - AppErrorBoundary    (variant="app")
 *     - PlayerErrorBoundary (variant="player")
 *     - PageErrorBoundary   (variant="page")
 *     - Any page that wants a consistent error or empty state UI
 *
 * VARIANTS:
 *   "app"    — Full-page centered layout. Used when the entire shell fails.
 *              Takes full viewport height, centered vertically.
 *   "player" — Compact inline bar. Used inside MusicPlayer slot.
 *              Minimal height, fits within the player bar region.
 *   "page"   — Default. Content-area error block. Used inside PageWrapper <main>.
 *              Centered within the scrollable content area.
 *
 * PROPS:
 *   variant       — "app" | "player" | "page"  (default: "page")
 *   title         — Main heading string  (required)
 *   message       — Supporting detail string  (optional)
 *   actionLabel   — Button text for the primary action  (optional)
 *   onAction      — Callback fired when primary action button is clicked  (optional)
 *   showHomeButton — Whether to render a secondary "Go to Library" link  (default: false)
 *
 * DESIGN TOKENS:
 *   All colors reference CSS variables from colors.css.
 *   No hardcoded hex values — theme changes propagate automatically.
 *
 * ACCESSIBILITY:
 *   - role="alert" on the outermost element so screen readers announce the error.
 *   - aria-live="assertive" for app-level and page-level variants.
 *   - aria-live="polite" for the player variant (less disruptive).
 *   - Focus management: primary action button receives focus on mount when present
 *     (only for app + page variants — player variant is too compact).
 *
 * WHAT DOES NOT CHANGE:
 *   - ErrorBoundary.jsx requires this file at '../../components/errors/ErrorState'
 *     from the errors/ directory. The import path must not change.
 *   - The `variant`, `title`, `message`, `actionLabel`, `onAction`, and
 *     `showHomeButton` prop names are referenced in ErrorBoundary.jsx — keep exact.
 */

import { useEffect, useRef } from 'react';

// ── Icons — inline SVG, zero external dependency ──────────────────────────────

/** Warning triangle — used for page and app error variants */
const WarningIcon = ({ size = 32 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9"  x2="12"   y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

/** Compact alert circle — used for player variant */
const AlertCircleIcon = ({ size = 18 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8"  x2="12"   y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

/** Home icon — used for "Go to Library" secondary action */
const HomeIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </svg>
);

/** Refresh icon — used inside "Try again" button */
const RefreshIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);

// ── ErrorState component ──────────────────────────────────────────────────────

/**
 * @param {{
 *   variant?:       'app' | 'player' | 'page',
 *   title:          string,
 *   message?:       string,
 *   actionLabel?:   string,
 *   onAction?:      () => void,
 *   showHomeButton?: boolean,
 * }} props
 */
const ErrorState = ({
  variant       = 'page',
  title,
  message,
  actionLabel,
  onAction,
  showHomeButton = false,
}) => {
  const actionRef = useRef(null);

  // Focus the primary action button on mount for app and page variants.
  // Skip for player — it's a compact bar, focus would be disruptive.
  useEffect(() => {
    if (variant !== 'player' && actionRef.current) {
      // Small delay so React's commit phase is fully done before focusing.
      const id = setTimeout(() => actionRef.current?.focus(), 80);
      return () => clearTimeout(id);
    }
  }, [variant]);

  // ── Player variant — compact inline bar ────────────────────────────────────
  if (variant === 'player') {
    return (
      <>
        <style>{PLAYER_STYLES}</style>
        <div
          className="es-player"
          role="alert"
          aria-live="polite"
          aria-label={title}
        >
          <span className="es-player__icon">
            <AlertCircleIcon size={16} />
          </span>
          <span className="es-player__text">{title}</span>
          {onAction && actionLabel && (
            <button
              className="es-player__btn"
              onClick={onAction}
              aria-label={actionLabel}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </>
    );
  }

  // ── App variant — full-page centered layout ────────────────────────────────
  // ── Page variant — content-area centered block ─────────────────────────────
  const isApp = variant === 'app';

  return (
    <>
      <style>{PAGE_STYLES}</style>
      <div
        className={`es-wrap ${isApp ? 'es-wrap--app' : 'es-wrap--page'}`}
        role="alert"
        aria-live="assertive"
        aria-label={title}
      >
        <div className="es-card">
          {/* Icon */}
          <div className="es-card__icon" aria-hidden="true">
            <WarningIcon size={isApp ? 36 : 28} />
          </div>

          {/* Text */}
          <div className="es-card__body">
            <h2 className="es-card__title">{title}</h2>
            {message && (
              <p className="es-card__message">{message}</p>
            )}
          </div>

          {/* Actions */}
          {(onAction || showHomeButton) && (
            <div className="es-card__actions">
              {onAction && actionLabel && (
                <button
                  ref={actionRef}
                  className="es-btn es-btn--primary"
                  onClick={onAction}
                >
                  <RefreshIcon size={14} />
                  {actionLabel}
                </button>
              )}
              {showHomeButton && (
                <a
                  href="/"
                  className="es-btn es-btn--secondary"
                  aria-label="Go to Library"
                >
                  <HomeIcon size={14} />
                  Go to Library
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
//
// All colors use CSS variables from colors.css.
// Injected via <style> tags to avoid build-pipeline CSS dependencies.
// These tags are de-duplicated by the browser (same content = one rule set).

const PAGE_STYLES = `
  .es-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-8, 32px) var(--space-4, 16px);
  }

  /* Full-viewport height for app-level catastrophic failure */
  .es-wrap--app {
    min-height: 100vh;
    background-color: var(--color-bg, #0f0f0f);
  }

  /* Content-area error: centered within scrollable main region */
  .es-wrap--page {
    min-height: 40vh;
  }

  .es-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-4, 16px);
    max-width: 400px;
    width: 100%;
    text-align: center;
    padding: var(--space-8, 32px) var(--space-6, 24px);
    background-color: var(--color-surface, #1c1c1c);
    border: 1px solid var(--color-border, #2a2a2a);
    border-radius: var(--radius-lg, 12px);
    box-shadow: var(--shadow-md, 0 4px 12px rgba(0,0,0,0.5));
  }

  .es-card__icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-lg, 12px);
    background-color: var(--color-danger-muted, rgba(244,63,94,0.10));
    color: var(--color-danger, #f43f5e);
    flex-shrink: 0;
  }

  .es-card__body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2, 8px);
  }

  .es-card__title {
    font-family: var(--font-family, 'Inter', sans-serif);
    font-size: var(--font-size-md, 15px);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--color-text-primary, #e5e7eb);
    line-height: var(--line-height-tight, 1.2);
    margin: 0;
    /* Override global h2 size which is 20px — error titles should be smaller */
    font-size: 15px;
  }

  .es-card__message {
    font-size: var(--font-size-sm, 12px);
    color: var(--color-text-secondary, #9ca3af);
    line-height: var(--line-height-normal, 1.5);
    margin: 0;
    max-width: 320px;
  }

  .es-card__actions {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
    justify-content: center;
    margin-top: var(--space-1, 4px);
  }

  /* ── Buttons ─────────────────────────────────────────────── */
  .es-btn {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1, 4px);
    padding: var(--space-2, 8px) var(--space-4, 16px);
    border-radius: var(--radius-sm, 6px);
    font-family: var(--font-family, 'Inter', sans-serif);
    font-size: var(--font-size-sm, 12px);
    font-weight: var(--font-weight-semibold, 600);
    cursor: pointer;
    border: 1px solid transparent;
    text-decoration: none;
    transition:
      background-color var(--transition-fast, 150ms ease),
      border-color var(--transition-fast, 150ms ease),
      opacity var(--transition-fast, 150ms ease);
    min-height: 36px;
    /* Minimum touch target for accessibility */
    min-height: 44px;
  }

  .es-btn:focus-visible {
    outline: 2px solid var(--color-accent, #22c55e);
    outline-offset: 2px;
  }

  .es-btn--primary {
    background-color: var(--color-accent, #22c55e);
    color: var(--color-text-inverse, #000);
    border-color: transparent;
  }
  .es-btn--primary:hover:not(:disabled) {
    background-color: var(--color-accent-hover, #16a34a);
  }

  .es-btn--secondary {
    background-color: transparent;
    color: var(--color-text-secondary, #9ca3af);
    border-color: var(--color-border, #2a2a2a);
  }
  .es-btn--secondary:hover:not(:disabled) {
    color: var(--color-text-primary, #e5e7eb);
    background-color: var(--color-surface-hover, #222222);
  }

  /* ── Responsive ──────────────────────────────────────────── */
  @media (max-width: 480px) {
    .es-card {
      padding: var(--space-6, 24px) var(--space-4, 16px);
    }
    .es-card__actions {
      flex-direction: column;
      width: 100%;
    }
    .es-btn {
      width: 100%;
      justify-content: center;
    }
  }
`;

const PLAYER_STYLES = `
  .es-player {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    color: var(--color-text-secondary, #9ca3af);
    height: 100%;
    width: 100%;
    box-sizing: border-box;
  }

  .es-player__icon {
    display: flex;
    align-items: center;
    color: var(--color-warning, #f59e0b);
    flex-shrink: 0;
  }

  .es-player__text {
    flex: 1;
    font-size: var(--font-size-sm, 12px);
    font-family: var(--font-family, 'Inter', sans-serif);
    color: var(--color-text-secondary, #9ca3af);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .es-player__btn {
    background: transparent;
    border: 1px solid var(--color-border, #2a2a2a);
    border-radius: var(--radius-sm, 6px);
    color: var(--color-text-secondary, #9ca3af);
    font-size: 11px;
    font-family: var(--font-family, 'Inter', sans-serif);
    font-weight: var(--font-weight-medium, 500);
    padding: 4px 10px;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
    transition:
      color var(--transition-fast, 150ms ease),
      border-color var(--transition-fast, 150ms ease);
    min-height: 28px;
  }

  .es-player__btn:hover {
    color: var(--color-text-primary, #e5e7eb);
    border-color: var(--color-border-emphasis, #444444);
  }

  .es-player__btn:focus-visible {
    outline: 2px solid var(--color-accent, #22c55e);
    outline-offset: 2px;
  }
`;

export default ErrorState;