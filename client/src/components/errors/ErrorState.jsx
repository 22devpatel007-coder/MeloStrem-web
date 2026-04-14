/**
 * client/src/components/errors/ErrorState.jsx
 *
 * PHASE 1 — TASK 1.3: Reusable error fallback UI component.
 *
 * VARIANTS:
 *   'app'    — Full-page centered layout. Used by AppErrorBoundary.
 *              Fills the entire viewport with a recovery screen.
 *
 *   'player' — Compact horizontal bar. Used by PlayerErrorBoundary.
 *              Fits within the player bar slot at the bottom of the screen.
 *              Same height as MiniPlayerBar (≈ 72px on desktop).
 *
 *   'page'   — Content-area block. Used by PageErrorBoundary.
 *              Fills the scroll region with a centered error state.
 *              Sidebar and player are unaffected.
 *
 * PROPS:
 *   variant        — 'app' | 'player' | 'page'  (default: 'page')
 *   title          — string  — headline shown to user
 *   message        — string  — supporting message
 *   actionLabel    — string  — retry button label  (default: 'Try again')
 *   onAction       — fn      — called on retry button click
 *   showHomeButton — bool    — show a "Go to Library" link (default: false)
 *
 * DESIGN TOKENS:
 *   All colors reference CSS variables from colors.css.
 *   No hardcoded hex values — consistent with the rest of the design system.
 *
 * WHY NO ROUTER DEPENDENCY ON PLAYER VARIANT:
 *   PlayerErrorBoundary wraps MusicPlayer which is mounted outside
 *   BrowserRouter's subtree... wait — actually MusicPlayer IS inside
 *   BrowserRouter (see App.jsx structure). So useNavigate would work,
 *   but we use a plain <a href="/"> to be safe regardless of where
 *   this component is rendered in the tree.
 */

// ─── Icons ────────────────────────────────────────────────────────────────────

const AlertIcon = ({ size = 40 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const PlayerAlertIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8"  x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" />
  </svg>
);

// ─── Shared style injection (once per mount) ──────────────────────────────────

const STYLES = `
  /* ── App variant — full viewport centered ──────────────────────────── */
  .es-app {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    width: 100%;
    background: var(--color-bg, #0f0f0f);
    padding: 24px;
    box-sizing: border-box;
    text-align: center;
  }

  /* ── Page variant — fills scroll region content area ───────────────── */
  .es-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    width: 100%;
    padding: 48px 24px;
    box-sizing: border-box;
    text-align: center;
  }

  /* ── Player variant — compact horizontal bar ───────────────────────── */
  .es-player {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: 72px;
    padding: 0 20px;
    background: var(--color-player-bg, #111111);
    border-top: 1px solid var(--color-player-border, #2a2a2a);
    box-sizing: border-box;
  }

  /* ── Icon container ────────────────────────────────────────────────── */
  .es-icon {
    color: var(--color-danger, #f43f5e);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }
  .es-player .es-icon {
    margin-bottom: 0;
  }

  /* ── Text block ────────────────────────────────────────────────────── */
  .es-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }
  .es-player .es-body {
    align-items: flex-start;
    flex: 1;
    min-width: 0;
    gap: 2px;
  }

  .es-title {
    font-family: var(--font-family, 'Inter', -apple-system, sans-serif);
    font-size: var(--font-size-lg, 17px);
    font-weight: var(--font-weight-semibold, 600);
    color: var(--color-text-primary, #e5e7eb);
    line-height: 1.3;
    margin: 0;
  }
  .es-app .es-title {
    font-size: var(--font-size-2xl, 24px);
  }
  .es-player .es-title {
    font-size: var(--font-size-base, 14px);
    font-weight: var(--font-weight-medium, 500);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .es-message {
    font-family: var(--font-family, 'Inter', -apple-system, sans-serif);
    font-size: var(--font-size-base, 14px);
    color: var(--color-text-secondary, #9ca3af);
    line-height: var(--line-height-normal, 1.5);
    max-width: 420px;
    margin: 0;
  }
  .es-app .es-message {
    font-size: var(--font-size-md, 15px);
  }
  .es-player .es-message {
    font-size: var(--font-size-sm, 12px);
    color: var(--color-text-muted, #4b5563);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Actions row ───────────────────────────────────────────────────── */
  .es-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 24px;
    flex-wrap: wrap;
    justify-content: center;
  }
  .es-player .es-actions {
    margin-top: 0;
    flex-shrink: 0;
  }

  /* Primary action — retry */
  .es-btn-retry {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    border-radius: var(--radius-md, 8px);
    background: var(--color-accent, #22c55e);
    color: var(--color-text-inverse, #000);
    font-family: var(--font-family, 'Inter', -apple-system, sans-serif);
    font-size: var(--font-size-base, 14px);
    font-weight: var(--font-weight-semibold, 600);
    border: none;
    cursor: pointer;
    transition: background var(--transition-fast, 150ms ease),
                transform var(--transition-fast, 150ms ease);
    white-space: nowrap;
    text-decoration: none;
  }
  .es-btn-retry:hover {
    background: var(--color-accent-hover, #16a34a);
    transform: translateY(-1px);
  }
  .es-btn-retry:focus-visible {
    outline: 2px solid var(--color-accent, #22c55e);
    outline-offset: 2px;
  }
  .es-btn-retry:active {
    transform: translateY(0);
  }

  /* Player variant — compact retry button */
  .es-player .es-btn-retry {
    padding: 6px 14px;
    font-size: var(--font-size-sm, 12px);
    border-radius: var(--radius-sm, 6px);
  }

  /* Secondary action — go home */
  .es-btn-home {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 9px 18px;
    border-radius: var(--radius-md, 8px);
    background: transparent;
    color: var(--color-text-secondary, #9ca3af);
    font-family: var(--font-family, 'Inter', -apple-system, sans-serif);
    font-size: var(--font-size-base, 14px);
    font-weight: var(--font-weight-medium, 500);
    border: 1px solid var(--color-border, #2a2a2a);
    cursor: pointer;
    transition: color var(--transition-fast, 150ms ease),
                border-color var(--transition-fast, 150ms ease),
                background var(--transition-fast, 150ms ease);
    text-decoration: none;
    white-space: nowrap;
  }
  .es-btn-home:hover {
    color: var(--color-text-primary, #e5e7eb);
    border-color: var(--color-border-emphasis, #444444);
    background: var(--color-surface-hover, #222222);
  }
  .es-btn-home:focus-visible {
    outline: 2px solid var(--color-accent, #22c55e);
    outline-offset: 2px;
  }

  /* ── Responsive ────────────────────────────────────────────────────── */
  @media (max-width: 480px) {
    .es-actions {
      flex-direction: column;
      width: 100%;
    }
    .es-btn-retry,
    .es-btn-home {
      width: 100%;
      justify-content: center;
    }
    .es-player .es-actions {
      flex-direction: row;
      width: auto;
    }
    .es-player .es-btn-retry {
      width: auto;
    }
  }
`;

// ─── ErrorState component ─────────────────────────────────────────────────────

const ErrorState = ({
  variant       = 'page',
  title         = 'Something went wrong',
  message       = 'An unexpected error occurred.',
  actionLabel   = 'Try again',
  onAction,
  showHomeButton = false,
}) => {
  // Validate variant — fall back to 'page' if unknown value passed
  const safeVariant = ['app', 'player', 'page'].includes(variant) ? variant : 'page';
  const containerClass = `es-${safeVariant}`;

  // Player variant uses a compact horizontal layout
  if (safeVariant === 'player') {
    return (
      <>
        <style>{STYLES}</style>
        <div className={containerClass} role="alert" aria-live="assertive">
          <div className="es-icon">
            <PlayerAlertIcon />
          </div>
          <div className="es-body">
            <p className="es-title">{title}</p>
            <p className="es-message">{message}</p>
          </div>
          {onAction && (
            <div className="es-actions">
              <button
                className="es-btn-retry"
                onClick={onAction}
                type="button"
              >
                {actionLabel}
              </button>
            </div>
          )}
        </div>
      </>
    );
  }

  // App and Page variants use the same vertical centered layout
  // (app adds min-height:100vh, page uses min-height:60vh — both via CSS)
  return (
    <>
      <style>{STYLES}</style>
      <div className={containerClass} role="alert" aria-live="assertive">
        <div className="es-icon">
          <AlertIcon size={safeVariant === 'app' ? 48 : 40} />
        </div>
        <div className="es-body">
          <h2 className="es-title">{title}</h2>
          <p className="es-message">{message}</p>
        </div>
        <div className="es-actions">
          {onAction && (
            <button
              className="es-btn-retry"
              onClick={onAction}
              type="button"
            >
              {actionLabel}
            </button>
          )}
          {showHomeButton && (
            <a
              className="es-btn-home"
              href="/"
              // Use plain <a> (not NavLink) — this component may render
              // inside AppErrorBoundary which is above BrowserRouter.
              // Plain href always works regardless of router mounting state.
            >
              Go to Library
            </a>
          )}
        </div>
      </div>
    </>
  );
};

export default ErrorState;