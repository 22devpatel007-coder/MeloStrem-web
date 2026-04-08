'use strict';

// ─── server/src/index.js ──────────────────────────────────────────────────────
//
// Production-ready entry point for MeloStream API server.
//
// Scalability notes:
//  • Stateless design — safe to run as multiple Render/K8s replicas behind a
//    load balancer.  All shared state (cache, sessions) lives in Redis/Firestore.
//  • Trust-proxy is set to 1 (single Render edge hop). Change to the real hop
//    count if you add Cloudflare in front of Render.
//  • Graceful shutdown drains in-flight requests before exit, preventing 502s
//    during rolling deploys.
//  • All configuration is validated at startup — the process exits before
//    binding a port if required env vars are missing.
//  • CORS allowlist is driven entirely by CLIENT_ORIGIN (comma-separated).
//    No code changes needed to add Vercel preview URLs.
// ─────────────────────────────────────────────────────────────────────────────

const express    = require('express');
const helmet     = require('helmet');
const cors       = require('cors');
const os         = require('os');

const config       = require('./config/index');
const logger       = require('./utils/logger');
const routes       = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

// ─────────────────────────────────────────────────────────────────────────────
// 1. STARTUP VALIDATION
//    Fail fast: cheap checks that catch misconfigured deployments before the
//    server ever starts binding a port.
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_ENV = ['PORT'];

// In production every secret must be explicit — no silent fallbacks.
if (config.nodeEnv === 'production') {
  REQUIRED_ENV.push('CLIENT_ORIGIN');
}

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  // Use console.error here because the logger may itself depend on env vars
  // that have not yet been validated.
  console.error(
    `[Startup] FATAL — missing required environment variable(s): ${missingEnv.join(', ')}. Exiting.`
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CORS ALLOWLIST
//    CLIENT_ORIGIN accepts a single origin OR comma-separated list:
//      CLIENT_ORIGIN=https://melostream.vercel.app,https://preview-branch.vercel.app
//
//    Local dev origins are injected automatically in non-production mode.
//    To add a new allowed origin in production: update the env var on Render —
//    no code change required.
// ─────────────────────────────────────────────────────────────────────────────

const rawOrigins = (config.clientOrigin || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = new Set(rawOrigins);

if (config.nodeEnv !== 'production') {
  ['http://localhost:3000', 'http://10.114.74.109:3000'].forEach((o) =>
    allowedOrigins.add(o)
  );
}

if (allowedOrigins.size === 0) {
  logger.warn(
    '[CORS] Allowed origins list is empty — all cross-origin browser ' +
    'requests will be blocked. Set CLIENT_ORIGIN.'
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. CORS OPTIONS
// ─────────────────────────────────────────────────────────────────────────────

const corsOptions = {
  origin(origin, callback) {
    // Allow requests with no Origin header (server-to-server, Postman, mobile)
    if (!origin) return callback(null, true);

    if (allowedOrigins.has(origin)) return callback(null, true);

    // Log blocked origin so you can debug Vercel preview-URL issues fast
    logger.warn(`[CORS] Blocked request from unlisted origin: ${origin}`);
    const err = new Error(`CORS: origin '${origin}' is not allowed.`);
    err.status = 403;
    return callback(err);
  },
  credentials  : true,
  methods      : ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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
// Helmet sets ~15 security-related HTTP response headers in one call.
app.use(helmet());

// ── 4b. CORS ─────────────────────────────────────────────────────────────────
// OPTIONS preflight MUST be handled before any auth/rate-limit middleware fires
// so browsers receive 200 (not 401/429) on preflight requests.
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

// ── 4c. Body parsers ─────────────────────────────────────────────────────────
// 1 MB hard cap on JSON/URL-encoded payloads.
// File uploads are handled by Multer inside individual routes (no limit here).
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── 4d. Global rate limiter ──────────────────────────────────────────────────
// Route-level limiters (searchLimiter, etc.) layer on top of this.
app.use(generalLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// 5. SYSTEM ROUTES
//    These are intentionally placed ABOVE /api so they are never blocked by
//    route-level auth or rate-limit middleware.
// ─────────────────────────────────────────────────────────────────────────────

// ── 5a. Health / liveness probe ──────────────────────────────────────────────
// Render and load balancers ping this to confirm the process is alive.
// Returns 200 as quickly as possible — no DB calls, no auth.
app.get('/health', (_req, res) => {
  res.status(200).json({
    status   : 'ok',
    timestamp: new Date().toISOString(),
    uptime   : Math.floor(process.uptime()),
    pid      : process.pid,
  });
});

// ── 5b. Readiness probe ──────────────────────────────────────────────────────
// Optional: Kubernetes / advanced load balancers use /ready to decide whether
// to send traffic.  Unlike /health this CAN call a cheap dependency check.
// Stubbed here — extend once you have a reliable connection-check helper.
app.get('/ready', (_req, res) => {
  // TODO: add lightweight Firebase Admin SDK ping when connection-check helper
  // is available (e.g. firebaseAdmin.app().options.projectId check).
  res.status(200).json({ status: 'ready' });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

app.use('/api', routes);

// ─────────────────────────────────────────────────────────────────────────────
// 7. FALLTHROUGH HANDLERS
//    These MUST come after all routes.
// ─────────────────────────────────────────────────────────────────────────────

// ── 7a. 404 — route not matched ───────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    code   : 'NOT_FOUND',
    message: 'The requested resource does not exist.',
  });
});

// ── 7b. Global error handler ──────────────────────────────────────────────────
// errorHandler must be the LAST app.use() call and must have exactly 4 params
// so Express recognises it as an error-handling middleware.
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
// 8. SERVER STARTUP
// ─────────────────────────────────────────────────────────────────────────────

const PORT = config.port;

const server = app.listen(PORT, () => {
  logger.info(
    `[Server] MeloStream listening on port ${PORT} ` +
    `[${config.nodeEnv}] pid=${process.pid} host=${os.hostname()}`
  );
  logger.info(
    `[CORS]   Allowed origins (${allowedOrigins.size}): ` +
    `${[...allowedOrigins].join(', ')}`
  );
});

// Propagate server-level errors (e.g. EADDRINUSE) to the unhandled-rejection
// safety net below so they are logged and cause a clean restart.
server.on('error', (err) => {
  logger.error('[Server] Fatal server error:', err);
  gracefulShutdown('SERVER_ERROR');
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. GRACEFUL SHUTDOWN
//    Render (and most PaaS/K8s providers) send SIGTERM before killing the
//    container.  We stop accepting new connections, drain in-flight requests,
//    then exit cleanly — preventing 502s during rolling deploys and restarts.
//
//    The 15-second force-exit ensures the process never hangs indefinitely
//    (e.g. if a streaming response never closes).
// ─────────────────────────────────────────────────────────────────────────────

let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[Server] ${signal} received — starting graceful shutdown.`);

  server.close((closeErr) => {
    if (closeErr) {
      logger.error('[Server] Error while closing HTTP server:', closeErr);
      process.exit(1);
    }

    logger.info('[Server] All HTTP connections closed. Exiting cleanly.');
    // Add cleanup calls here before exit if needed:
    //   await redisClient.quit();
    //   await firebaseAdmin.app().delete();
    process.exit(0);
  });

  // Hard kill-switch: if connections have not drained within 15 s, force-exit.
  // .unref() prevents this timer from keeping the event loop alive by itself.
  setTimeout(() => {
    logger.error('[Server] Graceful shutdown timed out (15 s) — forcing exit.');
    process.exit(1);
  }, 15_000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM')); // PaaS / K8s stop signal
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));  // Ctrl-C in local dev

// ─────────────────────────────────────────────────────────────────────────────
// 10. GLOBAL SAFETY NET
//     These handlers catch bugs that slipped through route-level try/catch.
//     In production: log the error details and trigger a clean restart via
//     gracefulShutdown so the process manager (Render, PM2, K8s) can bring
//     up a fresh instance.  A process limping in an unknown state is worse
//     than a brief restart gap.
// ─────────────────────────────────────────────────────────────────────────────

process.on('unhandledRejection', (reason, promise) => {
  logger.error('[Process] Unhandled promise rejection:', {
    reason,
    promise: promise.toString(),
  });
  // In production: restart; in local dev: keep running for fast iteration.
  if (config.nodeEnv === 'production') {
    gracefulShutdown('unhandledRejection');
  }
});

process.on('uncaughtException', (err) => {
  // uncaughtException means the Node event loop is in an undefined state.
  // Always exit — do not try to recover.
  logger.error('[Process] Uncaught exception (fatal):', err);
  gracefulShutdown('uncaughtException');
});

// Export for integration testing (supertest, etc.)
module.exports = app;