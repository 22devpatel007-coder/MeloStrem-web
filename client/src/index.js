/**
 * client/src/index.js
 *
 * Application entry point.
 *
 * PHASE 4 — TASK 4.2 additions:
 *   1. errorReporter.init() is called as the very first statement before
 *      React mounts anything. This ensures window.onerror and
 *      unhandledrejection handlers are active before any module-level code
 *      or React lifecycle runs.
 *
 *   2. The init() call is placed BEFORE ReactDOM.render / createRoot so that
 *      errors thrown during the initial render pass are also captured.
 *
 * PWA additions:
 *   - serviceWorkerRegistration.register() called after React mounts.
 *   - onUpdate fires a custom DOM event that Toast/banner can listen to.
 *
 * ORDER MATTERS:
 *   errorReporter.init()              ← must be first (registers global handlers)
 *   CSS imports                       ← passive, no side effects
 *   ReactDOM.createRoot()             ← starts the React tree
 *   serviceWorkerRegistration.register() ← after render, non-blocking
 *
 * NOTE ON CIRCULAR IMPORTS:
 *   errorReporter.js uses plain fetch(), not api.js. It does NOT import
 *   firebase, auth, or any store. This means importing it here at the entry
 *   point creates zero circular dependency risk.
 */

// ── All imports must be at the top ───────────────────────────────────────────
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { init as initErrorReporter } from './services/errorReporter';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

// ── Boot error reporter before anything else (Phase 4 Task 4.2) ──────────────
initErrorReporter();

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register SW after render — non-blocking, production only
serviceWorkerRegistration.register({
  onSuccess: () => {
    // App shell cached — fire a DOM event so any component can react
    window.dispatchEvent(new CustomEvent('sw:success'));
  },
  onUpdate: (registration) => {
    // New version available — fire event with registration so update banner can use it
    window.dispatchEvent(new CustomEvent('sw:update', { detail: registration }));
  },
});