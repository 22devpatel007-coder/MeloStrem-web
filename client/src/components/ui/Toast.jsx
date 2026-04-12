/**
 * client/src/components/ui/Toast.jsx
 *
 * Production-grade toast system.
 *
 * WHAT CHANGED:
 *  - ToastProvider + useToast hook: centralized queue, no prop-drilling
 *  - Portal rendering: renders outside song rows, no z-index wars
 *  - Queue-based: multiple toasts stack vertically, auto-dismiss FIFO
 *  - Per-toast type icons: success (✓), error (✕), info (i), warning (!)
 *  - Slide-in animation from bottom-right, slide-out on dismiss
 *  - Max 3 toasts visible at once; oldest auto-removed when queue overflows
 *  - Fully accessible: role="alert", aria-live="polite"
 *  - useToast() hook exposed for use anywhere in the app
 *
 * USAGE:
 *   // 1. Wrap app in ToastProvider (add once in App.jsx)
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 *
 *   // 2. Use hook anywhere
 *   const { toast } = useToast();
 *   toast.success('Added to Liked Songs');
 *   toast.error('Failed to like song');
 *   toast.info('Added to queue');
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_TOASTS    = 3;
const DEFAULT_DURATION = 3000;

// ── Context ───────────────────────────────────────────────────────────────────
const ToastContext = createContext(null);

// ── ToastProvider ─────────────────────────────────────────────────────────────
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const counterRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)),
    );
    // Remove from DOM after exit animation
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 320);
  }, []);

  const add = useCallback(
    (message, type = 'info', duration = DEFAULT_DURATION) => {
      const id = ++counterRef.current;

      setToasts((prev) => {
        const next = [...prev, { id, message, type, exiting: false }];
        // Cap at MAX_TOASTS — remove oldest if overflow
        if (next.length > MAX_TOASTS) {
          const [oldest, ...rest] = next;
          // Mark oldest exiting before removing
          setTimeout(() => dismiss(oldest.id), 0);
          return rest;
        }
        return next;
      });

      if (duration > 0) {
        setTimeout(() => dismiss(id), duration);
      }

      return id;
    },
    [dismiss],
  );

  const api = {
    success: (msg, dur) => add(msg, 'success', dur),
    error:   (msg, dur) => add(msg, 'error',   dur),
    info:    (msg, dur) => add(msg, 'info',     dur),
    warning: (msg, dur) => add(msg, 'warning',  dur),
    dismiss,
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <ToastContainer toasts={toasts} onDismiss={dismiss} />,
        document.body,
      )}
    </ToastContext.Provider>
  );
};

// ── useToast ──────────────────────────────────────────────────────────────────
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return { toast: ctx };
};

// ── ToastContainer ────────────────────────────────────────────────────────────
const ToastContainer = ({ toasts, onDismiss }) => (
  <>
    <style>{TOAST_STYLES}</style>
    <div
      className="toast-container"
      aria-live="polite"
      aria-label="Notifications"
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  </>
);

// ── ToastItem ─────────────────────────────────────────────────────────────────
const ToastItem = ({ toast, onDismiss }) => {
  const { id, message, type, exiting } = toast;

  return (
    <div
      className={[
        'toast-item',
        `toast-item--${type}`,
        exiting ? 'toast-item--exit' : 'toast-item--enter',
      ].join(' ')}
      role="alert"
    >
      <span className="toast-item__icon" aria-hidden="true">
        {ICONS[type]}
      </span>
      <span className="toast-item__msg">{message}</span>
      <button
        className="toast-item__close"
        onClick={() => onDismiss(id)}
        aria-label="Dismiss notification"
      >
        ✕
      </button>
    </div>
  );
};

// ── Icons ─────────────────────────────────────────────────────────────────────
const ICONS = {
  success: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  error: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  ),
  warning: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  info: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

// ── Styles ────────────────────────────────────────────────────────────────────
const TOAST_STYLES = `
  .toast-container {
    position: fixed;
    bottom: 88px; /* sits above MiniPlayerBar */
    right: 20px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 8px;
    pointer-events: none;
    max-width: 360px;
    width: calc(100vw - 40px);
  }

  .toast-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 10px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13.5px;
    font-weight: 500;
    line-height: 1.4;
    color: #fff;
    box-shadow: 0 4px 20px rgba(0,0,0,0.45), 0 1px 4px rgba(0,0,0,0.2);
    pointer-events: all;
    backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,0.08);
    will-change: transform, opacity;
  }

  .toast-item--success { background: rgba(21, 128, 61, 0.92); }
  .toast-item--error   { background: rgba(185, 28, 28, 0.92); }
  .toast-item--warning { background: rgba(161, 98, 7, 0.92);  }
  .toast-item--info    { background: rgba(30, 64, 175, 0.92); }

  .toast-item--enter {
    animation: toast-slide-in 0.28s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }
  .toast-item--exit {
    animation: toast-slide-out 0.28s ease-in forwards;
  }

  @keyframes toast-slide-in {
    from { opacity: 0; transform: translateX(100%) scale(0.9); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }
  @keyframes toast-slide-out {
    from { opacity: 1; transform: translateX(0) scale(1); }
    to   { opacity: 0; transform: translateX(100%) scale(0.9); }
  }

  .toast-item__icon {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    opacity: 0.9;
  }
  .toast-item__msg {
    flex: 1;
    min-width: 0;
  }
  .toast-item__close {
    background: none;
    border: none;
    color: rgba(255,255,255,0.6);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
    line-height: 1;
    transition: color 0.15s, background 0.15s;
  }
  .toast-item__close:hover {
    color: #fff;
    background: rgba(255,255,255,0.1);
  }

  @media (max-width: 480px) {
    .toast-container {
      right: 12px;
      bottom: 80px;
      width: calc(100vw - 24px);
    }
  }
`;

export default ToastItem;