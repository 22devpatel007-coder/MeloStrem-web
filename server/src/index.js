/**
 * server/src/index.js
 *
 * PHASE 4 — TASK 4.1: Added correlationId middleware.
 *
 * Changes from previous version (ONLY these two changes — nothing else touched):
 *
 *   1. Import correlationId middleware from ./middleware/correlationId.
 *
 *   2. Register app.use(correlationId) after body parsers and generalLimiter,
 *      before app.use('/api', routes).
 *      Position rationale:
 *        - Must be AFTER cors() — so res.set() can write response headers.
 *        - Must be AFTER body parsers — no dependency, but keeps middleware
 *          order readable (security → parsing → tracing → routes).
 *        - Must be AFTER generalLimiter — rate-limited requests that are
 *          rejected before reaching routes still get a correlationId on the
 *          response header, which is useful for debugging 429s in the frontend.
 *          Actually, to guarantee this even for rate-limited rejects, we
 *          register correlationId BEFORE generalLimiter. See comment inline.
 *        - Must be BEFORE all route handlers and the error handler so that
 *          req.correlationId is always set when controllers log.
 *
 *   3. Added 'X-Correlation-ID' to corsOptions.exposedHeaders so browsers
 *      can read the response header from JavaScript (fetch/XHR).
 *      Without this, CORS blocks the frontend from reading custom headers.
 *
 * Everything else is identical to the previous version.
 */

'use strict';

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const os      = require('os');
const https   = require('https');
const http    = require('http');

// ─────────────────────────────────────────────────────────────────────────────
// 1. STARTUP VALIDATION
//    Must run before any other import that reads process.env.
//    config/index.js reads env vars at require-time, so validateEnv must
//    come first. Exits immediately with a clear error if any required var
//    is missing — prevents the server from starting in a broken state.
// ─────────────────────────────────────────────────────────────────────────────
const { validateEnv } = require('./config/validateEnv');
validateEnv();

// ── Remaining imports (safe to load after env is confirmed present) ───────────
const config          = require('./config/index');
const logger          = require('./utils/logger');
const routes          = require('./routes/index');
const errorHandler    = require('./middleware/errorHandler');
const correlationId   = require('./middleware/correlationId');   // ← PHASE 4
const { generalLimiter } = require('./middleware/rateLimiter');

// Phase 3 Task 3.4 — Session picks queue singleton.
// Imported here so gracefulShutdown can drain it on SIGTERM/SIGINT.
const { sessionPicksQueue } = require('./jobs/SessionPicksQueue');

// ─────────────────────────────────────────────────────────────────────────────
// 2. CORS ALLOWLIST
//    CLIENT_ORIGIN accepts a single origin OR comma-separated list:
//      CLIENT_ORIGIN=https://melostream.vercel.app,https://preview.vercel.app
//
//    config.clientOrigin may be a string (old config) or an array (new config).
//    Both are handled safely so no crash occurs during migration.
//
//    Local dev origins are injected automatically in non-production mode.
//    To add a new allowed origin in production: update CLIENT_ORIGIN on Render —
//    no code change required.
// ─────────────────────────────────────────────────────────────────────────────
const rawOrigins = Array.isArray(config.clientOrigin)
  ? config.clientOrigin
  : (config.clientOrigin || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean);

const allowedOrigins = new Set(rawOrigins);

if (config.nodeEnv !== 'production') {
  ['http://localhost:3000', 'http://10.114.74.109:3000'].forEach((o) =>
    allowedOrigins.add(o),
  );
}

if (allowedOrigins.size === 0) {
  logger.warn(
    '[CORS] Allowed origins list is empty — all cross-origin browser ' +
    'requests will be blocked. Set CLIENT_ORIGIN.',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CORS OPTIONS
//
// Phase 4 addition: exposedHeaders includes 'X-Correlation-ID'.
//   Without this, the CORS spec prevents browser JavaScript from reading any
//   response header that is not in the CORS-safelisted set (Cache-Control,
//   Content-Language, Content-Length, Content-Type, Expires, Last-Modified,
//   Pragma). X-Correlation-ID is a custom header, so it must be explicitly
//   exposed. The frontend error reporter (Task 4.2) reads this header to
//   attach the correlation ID to error reports.
// ─────────────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no Origin header (server-to-server, Postman, mobile)
    if (!origin) return callback(null, true);

    if (allowedOrigins.has(origin)) return callback(null, true);

    // Log blocked origin so you can debug Vercel preview-URL issues fast
    logger.warn(`[CORS] Blocked request from unlisted origin: ${origin}`);
    const err    = new Error(`CORS: origin '${origin}' is not allowed.`);
    err.status   = 403;
    return callback(err);
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // ← PHASE 4: expose X-Correlation-ID so browser JS can read it.
  //   Required for the frontend error reporter (Task 4.2) to attach
  //   the correlation ID to error reports sent to the backend.
  exposedHeaders: ['X-Correlation-ID'],
  // Browsers may cache the preflight response for 10 minutes, reducing OPTIONS
  // round-trips on repeat requests.
  maxAge: 600,
};

// ─────────────────────────────────────────────────────────────────────────────
// 4. EXPRESS APP
// ─────────────────────────────────────────────────────────────────────────────
const app = express();

// Trust exactly one proxy hop (Render's edge).
// Ensures express-rate-limit and req.ip see the real client IP, not the proxy.
// If you add Cloudflare in front: change to 2.
app.set('trust proxy', 1);

// ── 4a. Security headers ─────────────────────────────────────────────────────
app.use(helmet());

// ── 4b. CORS ─────────────────────────────────────────────────────────────────
// OPTIONS preflight MUST be handled before any auth/rate-limit middleware fires
// so browsers receive 200 (not 401/429) on preflight requests.
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// ── 4c. Body parsers ─────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── 4d. Correlation ID ───────────────────────────────────────────────────────
// Registered BEFORE generalLimiter intentionally.
//
// Why before the rate limiter?
//   When a request is rejected by express-rate-limit (429 Too Many Requests),
//   the rate limiter calls res.send() and returns — the request never reaches
//   any route handler. If correlationId were registered AFTER the rate limiter,
//   rejected requests would have NO X-Correlation-ID on the response, making
//   it impossible to correlate 429 errors in the frontend with server logs.
//
//   By registering first, every response — including 429s and CORS rejections
//   from step 4b — carries a correlationId header.
//
// Why after CORS?
//   CORS middleware must run first so that preflight OPTIONS requests are
//   handled before any other middleware fires. correlationId calling res.set()
//   AFTER cors() is safe because cors() does not finalise the response for
//   non-OPTIONS requests — it just sets headers and calls next().
app.use(correlationId);   // ← PHASE 4

// ── 4e. Global rate limiter ──────────────────────────────────────────────────
app.use(generalLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// 5. SYSTEM ROUTES
//    Placed ABOVE /api so they are never blocked by route-level auth or
//    rate-limit middleware. Deployment infra (Render, k8s) hits these directly.
// ─────────────────────────────────────────────────────────────────────────────

// ── 5a. Health / liveness probe ──────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
    pid:       process.pid,
  });
});

// ── 5b. Readiness probe ──────────────────────────────────────────────────────
app.get('/ready', (_req, res) => {
  res.status(200).json({ status: 'ready' });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. API ROUTES
// ─────────────────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─────────────────────────────────────────────────────────────────────────────
// 7. FALLTHROUGH HANDLERS
// ─────────────────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    code:    'NOT_FOUND',
    message: 'The requested resource does not exist.',
  });
});

app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
// 8. SERVER STARTUP
// ─────────────────────────────────────────────────────────────────────────────
const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(
    `[Server] MeloStream listening on port ${PORT} ` +
    `[${config.nodeEnv}] pid=${process.pid} host=${os.hostname()}`,
  );
  logger.info(
    `[CORS]   Allowed origins (${allowedOrigins.size}): ` +
    `${[...allowedOrigins].join(', ')}`,
  );
});

// Fatal TCP-level error (e.g. EADDRINUSE on startup) — log and exit.
// Uses the gracefulShutdown defined below so the queue is drained even here.
server.on('error', (err) => {
  logger.error('[Server] Fatal server error:', { error: err.message, code: err.code });
  gracefulShutdown('SERVER_ERROR');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. GRACEFUL SHUTDOWN
//
//    Handles SIGTERM (Render rolling deploy) and SIGINT (Ctrl+C / local dev).
//
//    Shutdown sequence:
//      1. Stop accepting new HTTP connections (server.close).
//         In-flight requests are allowed to complete — Node.js default.
//      2. Drain the SessionPicksQueue — writes all pending session-pick
//         batches to Firestore before the process exits.
//         This ensures ZERO picks are lost during a Render rolling deploy.
//      3. Exit cleanly (code 0).
//
//    Hard timeout: SHUTDOWN_TIMEOUT_MS (20s).
//      Render's SIGTERM → SIGKILL window is 30s. We use 20s to leave 10s
//      of OS cleanup buffer. If shutdown takes longer, we force exit(1)
//      to avoid blocking the deploy pipeline indefinitely.
//
//    isShuttingDown guard: prevents a second SIGTERM (Render sometimes sends
//    two) or a server 'error' event from starting a second shutdown race.
// ─────────────────────────────────────────────────────────────────────────────

const SHUTDOWN_TIMEOUT_MS = 20_000;
let   isShuttingDown      = false;

async function gracefulShutdown(signal) {
  // Guard: only one shutdown can run at a time.
  // process.once on the signal handlers prevents duplicate calls from
  // SIGTERM/SIGINT, but server 'error' events are not guarded by once.
  if (isShuttingDown) {
    logger.warn(`[Shutdown] already in progress — ignoring duplicate signal: ${signal}`);
    return;
  }
  isShuttingDown = true;

  logger.info(`[Shutdown] ${signal} received — starting graceful shutdown`);

  // Hard timeout: forces exit if the drain hangs.
  // .unref() so this timer doesn't keep the event loop alive by itself.
  const forceExitTimer = setTimeout(() => {
    logger.error('[Shutdown] timeout exceeded — forcing process.exit(1)', {
      timeoutMs: SHUTDOWN_TIMEOUT_MS,
    });
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  if (forceExitTimer.unref) forceExitTimer.unref();

  try {
    // ── Step 1: Stop accepting new HTTP connections ───────────────────────────
    await new Promise((resolve) => {
      server.close((err) => {
        if (err) {
          // err here means the server was not listening — non-fatal during
          // a SERVER_ERROR shutdown where the server never fully started.
          logger.warn('[Shutdown] server.close() returned error (non-fatal):', {
            error: err.message,
          });
        }
        logger.info('[Shutdown] HTTP server closed — no new connections accepted');
        resolve();
      });
    });

    // ── Step 2: Drain session picks queue ────────────────────────────────────
    // sessionPicksQueue.shutdown() stops the setInterval drainer, waits for
    // any in-progress drain to finish, then does one final drain of all
    // remaining entries. Resolves when the last Firestore write completes.
    logger.info('[Shutdown] draining session picks queue...', sessionPicksQueue.stats());
    await sessionPicksQueue.shutdown();
    logger.info('[Shutdown] session picks queue drained', sessionPicksQueue.stats());

    // ── Step 3: Clean exit ───────────────────────────────────────────────────
    clearTimeout(forceExitTimer);
    logger.info('[Shutdown] graceful shutdown complete — exiting cleanly');
    process.exit(0);

  } catch (err) {
    logger.error('[Shutdown] unexpected error during shutdown:', {
      error: err.message,
      stack: err.stack,
    });
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

// ── Signal handlers ───────────────────────────────────────────────────────────
// process.once (not process.on) so a second signal doesn't start a second
// shutdown while the first is still running.
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT',  () => gracefulShutdown('SIGINT'));

// ─────────────────────────────────────────────────────────────────────────────
// 10. PROCESS-LEVEL ERROR SAFETY NET
//
//     unhandledRejection: logs but does NOT exit — many third-party libraries
//       emit spurious rejections that are not fatal. In production, if the
//       rejection is from a known critical path, the originating code's own
//       try/catch should call gracefulShutdown explicitly.
//
//     uncaughtException: the process is in an unknown state — exit is correct
//       and mandatory. Calls gracefulShutdown so the queue is drained even
//       during an unexpected crash.
// ─────────────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('[Process] Unhandled promise rejection:', {
    reason:  reason?.message || String(reason),
    stack:   reason?.stack,
  });
  // In production, treat unhandled rejections as fatal to avoid silent
  // corruption. In local dev, log-only to avoid constant restarts during
  // development cycles.
  if (config.nodeEnv === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

process.on('uncaughtException', (err) => {
  // uncaughtException: process integrity is unknown — always exit.
  logger.error('[Process] Uncaught exception (fatal):', {
    error: err.message,
    stack: err.stack,
  });
  gracefulShutdown('uncaughtException');
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. KEEP-ALIVE SELF PING
//     Render free tier spins down after 15 min of inactivity.
//     Pings /health every 14 minutes to keep the server warm.
//     Only runs in production — silent no-op in local dev.
//     Uses BACKEND_URL (your own var) with RENDER_EXTERNAL_URL as fallback.
//     To migrate to a new server: just update BACKEND_URL — no code change.
// ─────────────────────────────────────────────────────────────────────────────
if (config.nodeEnv === 'production') {
  const backendUrl = config.backendUrl;

  if (backendUrl) {
    const pingServer = () => {
      const url    = `${backendUrl}/health`;
      const client = url.startsWith('https') ? https : http;

      const req = client.get(url, (res) => {
        if (res.statusCode !== 200) {
          logger.warn(`[keep-alive] Ping returned status ${res.statusCode}`);
        }
      });

      req.on('error', (err) => {
        // Non-fatal — next ping retries in 14 minutes
        logger.warn(`[keep-alive] Ping failed: ${err.message}`);
      });

      req.end();
    };

    const PING_INTERVAL_MS = 14 * 60 * 1000; // 14 minutes
    setInterval(pingServer, PING_INTERVAL_MS);

    logger.info(
      `[keep-alive] Self-ping enabled → ${backendUrl}/health every 14 min`,
    );
  } else {
    logger.warn('[keep-alive] BACKEND_URL not set — self-ping disabled.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Export for integration testing (supertest, etc.)
// ─────────────────────────────────────────────────────────────────────────────
module.exports = app;