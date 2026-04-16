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
 * ORDER MATTERS:
 *   errorReporter.init()   ← must be first (registers global handlers)
 *   CSS imports            ← passive, no side effects
 *   ReactDOM.createRoot()  ← starts the React tree
 *
 * NOTE ON CIRCULAR IMPORTS:
 *   errorReporter.js uses plain fetch(), not api.js. It does NOT import
 *   firebase, auth, or any store. This means importing it here at the entry
 *   point creates zero circular dependency risk.
 */
// ── React bootstrap ───────────────────────────────────────────────────────────
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// ── Styles ────────────────────────────────────────────────────────────────────
import './styles/index.css';

// ── Phase 4 Task 4.2: boot error reporter before anything else ────────────────
import { init as initErrorReporter } from './services/errorReporter';
initErrorReporter();



const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);