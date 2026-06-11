/**
 * server/src/index.js
 *
 * PHASE 4 — TASK 4.3: Detailed Health and Readiness Probes
 *
 * Changes from previous version (ONLY these — nothing else touched):
 *
 *   1. Import package.json version field for the /health response.
 *      Read once at module load, never on each request.
 *
 *   2. Import { db } from ./config/firebase and cloudinary from
 *      ./config/cloudinary for dependency injection into checkReadiness.
 *      These are the exact same singleton instances the rest of the app uses.
 *
 *   3. Import { checkReadiness } from ./services/healthChecker.
 *
 *   4. Enrich GET /health:
 *        Before:  { status, timestamp, uptime, pid }
 *        After:   { status, timestamp, uptime, pid, version, environment }
 *      The new fields confirm the correct build is deployed and which
 *      environment is running — critical for diagnosing deploy issues.
 *      No async work — /health stays a synchronous liveness check.
 *
 *   5. Enrich GET /ready:
 *        Before:  { status: 'ready' }   (always 200, no real checks)
 *        After:   Live dependency probes for Firestore + Cloudinary.
 *                 200 when all checks pass, 503 when any check fails.
 *                 Response shape: { ready, checks, errors? }
 *      /ready is now the signal Render/k8s use to route traffic.
 *      503 from /ready stops new traffic from reaching an unhealthy instance.
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
const httpLogger = require('./middleware/httpLogger');

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
const correlationId   = require('./middleware/correlationId');
const { generalLimiter } = require('./middleware/rateLimiter');

// Phase 3 Task 3.4 — Session picks queue singleton.
// Imported here so gracefulShutdown can drain it on SIGTERM/SIGINT.
const { sessionPicksQueue } = require('./jobs/SessionPicksQueue');

// ── Phase 4 Task 4.3 — Health probe dependencies ─────────────────────────────
//
// Read once at startup, never inside a request handler.
//
// version: read from package.json at module load time (synchronous require).
//   Avoids fs.readFile on every /health request — the value never changes
//   during a process's lifetime.
//
// db, cloudinary: the exact same singleton instances every controller uses.
//   Injecting them into checkReadiness (rather than requiring inside the
//   service) makes both units independently testable with mocks.
const { version }          = require('../package.json');
const { db }               = require('./config/firebase');
const cloudinary           = require('./config/cloudinary');
const { checkReadiness }   = require('./services/healthChecker');

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
// Phase 4 Task 4.1 addition: exposedHeaders includes 'X-Correlation-ID'.
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
  exposedHeaders: ['X-Correlation-ID'],
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
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

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
app.use(correlationId);

app.use(httpLogger);
// ── 4e. Global rate limiter ──────────────────────────────────────────────────
app.use(generalLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// 5. SYSTEM ROUTES
//
//    Placed ABOVE /api so they are never blocked by route-level auth or
//    rate-limit middleware. Deployment infra (Render, k8s) hits these directly.
//
// ── 5a. Health / liveness probe ─────────────────────────────────────────────
//
//    Purpose: confirm the process is alive and the correct version is running.
//    Contract: always returns 200. Never performs async work.
//
//    Why synchronous-only for /health?
//      The liveness probe is used by Render to decide whether to restart the
//      instance. If /health does async work (Firestore, Cloudinary) and those
//      are slow, the liveness probe times out and Render restarts a healthy
//      instance unnecessarily. Liveness = "is the process alive?", not "are
//      all dependencies healthy?". The latter is /ready's job.
//
//    Fields added in Task 4.3:
//      version     — from package.json, read once at module load.
//                    Confirms the correct build is deployed. If a deploy
//                    partially rolls out, you can see mismatched versions
//                    across instances in your uptime monitor.
//      environment — NODE_ENV value. Confirms you are not accidentally
//                    hitting a staging server in production monitoring.
//
//    Fields preserved from before:
//      status      — always 'ok' (process is alive by definition of responding)
//      timestamp   — ISO-8601 UTC. Lets monitors verify clock skew.
//      uptime      — process uptime in seconds. Confirms no silent restart.
//      pid         — process ID. Useful for correlating OS metrics with logs.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.status(200).json({
    status:      'ok',
    timestamp:   new Date().toISOString(),
    uptime:      Math.floor(process.uptime()),
    pid:         process.pid,
    version,                           // ← Task 4.3: from package.json
    environment: config.nodeEnv,       // ← Task 4.3: NODE_ENV value
  });
});

// ── 5b. Readiness probe ──────────────────────────────────────────────────────
//
//    Purpose: confirm all dependencies are reachable before Render routes
//    traffic to this instance.
//
//    Contract:
//      200 { ready: true,  checks: { firestore: 'ok', cloudinary: 'ok' } }
//        → instance is healthy; Render routes traffic here.
//      503 { ready: false, checks: { firestore: 'error', cloudinary: 'ok' },
//            errors: { firestore: 'firestore unreachable' } }
//        → instance is unhealthy; Render routes traffic to other instances.
//
//    Why 503 (not 500)?
//      503 Service Unavailable is the correct HTTP status for a dependency
//      outage. It signals to load balancers and uptime monitors that the
//      service is temporarily unavailable, not that the app itself crashed.
//      Render's health check configuration expects 2xx for healthy — anything
//      else (including 503) marks the instance as unhealthy.
//
//    Probe behaviour (delegated to services/healthChecker.js):
//      - Firestore: lists one document from _health collection (read-only).
//      - Cloudinary: calls cloudinary.api.ping() (no assets fetched).
//      - Both probes run concurrently (Promise.all) — total latency is
//        bounded by the slowest probe, not the sum.
//      - Both probes are time-bounded (5s hard timeout each).
//      - Both probes cache their result for 10s to prevent hammering
//        dependencies on every Render polling interval.
//
//    Keep-alive self-ping targets /health (not /ready).
//    Reason: /ready does async network I/O; /health does not. The keep-alive
//    ping runs every 14 minutes and only needs to confirm the process is alive.
//    Using /ready for the ping would create unnecessary Firestore + Cloudinary
//    calls during normal operation when nothing is wrong.
// ─────────────────────────────────────────────────────────────────────────────
app.get('/ready', async (_req, res) => {
  try {
    const readiness = await checkReadiness({ db, cloudinary });

    const status = readiness.ready ? 200 : 503;

    // Log every failed readiness check so on-call engineers see the failure
    // in Winston/Datadog without having to manually poll /ready.
    if (!readiness.ready) {
      logger.warn('[Ready] Readiness check failed:', {
        checks: readiness.checks,
        errors: readiness.errors,
      });
    }

    return res.status(status).json({
      ready:     readiness.ready,
      timestamp: new Date().toISOString(),
      checks:    readiness.checks,
      // errors field is present only when there are failures — omitted on
      // happy path to keep the response clean for uptime monitors.
      ...(readiness.errors ? { errors: readiness.errors } : {}),
    });

  } catch (err) {
    // checkReadiness is designed to never throw — all probe errors are caught
    // internally and returned as { ok: false }. This catch block is a final
    // safety net for programming errors in healthChecker.js itself.
    logger.error('[Ready] Unexpected error in readiness handler:', {
      error: err.message,
      stack: err.stack,
    });

    return res.status(503).json({
      ready:     false,
      timestamp: new Date().toISOString(),
      checks:    {
        firestore:  'error',
        cloudinary: 'error',
      },
      errors: {
        internal: 'readiness check failed unexpectedly',
      },
    });
  }
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
  if (isShuttingDown) {
    logger.warn(`[Shutdown] already in progress — ignoring duplicate signal: ${signal}`);
    return;
  }
  isShuttingDown = true;

  logger.info(`[Shutdown] ${signal} received — starting graceful shutdown`);

  // Hard timeout: forces exit if the drain hangs.
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
          logger.warn('[Shutdown] server.close() returned error (non-fatal):', {
            error: err.message,
          });
        }
        logger.info('[Shutdown] HTTP server closed — no new connections accepted');
        resolve();
      });
    });
    // ── Step 1b: Stop keep-alive interval ────────────────────────────────────
    keepAlive.stop();
    // ── Step 2: Drain session picks queue ────────────────────────────────────
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
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT',  () => gracefulShutdown('SIGINT'));

// ─────────────────────────────────────────────────────────────────────────────
// 10. PROCESS-LEVEL ERROR SAFETY NET
// ─────────────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('[Process] Unhandled promise rejection:', {
    reason:  reason?.message || String(reason),
    stack:   reason?.stack,
  });
  if (config.nodeEnv === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

process.on('uncaughtException', (err) => {
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
//
//     Note: intentionally pings /health (not /ready).
//     /ready does live Firestore + Cloudinary network calls. Pinging /ready
//     every 14 minutes would create unnecessary dependency load during normal
//     operation when nothing is wrong. /health is synchronous and cheap.
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// 11. KEEP-ALIVE SELF PING
//     Render free tier spins down after 15 min of inactivity.
//     Extracted to KeepAlive service for validation, failure tracking,
//     escalation, jitter, and clean shutdown integration.
//     Interval is env-configurable via KEEP_ALIVE_INTERVAL_MS.
// ─────────────────────────────────────────────────────────────────────────────
const { KeepAlive } = require('./services/keepAlive');
const keepAlive = new KeepAlive({
  backendUrl:  config.backendUrl,
  intervalMs:  config.keepAliveIntervalMs,
  nodeEnv:     config.nodeEnv,
  logger,
});
keepAlive.start();

// ─────────────────────────────────────────────────────────────────────────────
// Export for integration testing (supertest, etc.)
// ─────────────────────────────────────────────────────────────────────────────
module.exports = app; 