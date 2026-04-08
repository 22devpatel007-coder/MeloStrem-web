// ─── server/src/index.js ──────────────────────────────────────────────────────
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/index');
const logger = require('./utils/logger');
const routes = require('./routes/index');
const errorHandler = require('./middleware/errorHandler');
const { generalLimiter } = require('./middleware/rateLimiter');

const app = express();

// ── CORS ──────────────────────────────────────────────────────────────────────
// CLIENT_ORIGIN in .env supports a single origin OR a comma-separated list:
//
//   On Render dashboard → Environment → add:
//   CLIENT_ORIGIN=https://music-web-gamma-eight.vercel.app,http://localhost:3000
//
// NEVER leave this as only localhost in production.
const rawOrigins = (config.clientOrigin || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = new Set(rawOrigins);

// Always allow localhost in non-production environments
if (config.nodeEnv !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://127.0.0.1:3000');
}

if (allowedOrigins.size === 0) {
  // Safety net: if env var is missing entirely, log a loud warning.
  // Do NOT default to '*' in production — that removes all CORS protection.
  logger.error(
    '[CORS] CRITICAL: CLIENT_ORIGIN is not set. All browser requests will be blocked. ' +
    'Set CLIENT_ORIGIN in your Render environment variables.'
  );
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, Postman, curl, mobile apps)
    if (!origin) return callback(null, true);

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    logger.warn(`[CORS] Blocked request from unlisted origin: ${origin}`);
    // Return a proper HTTP 403 error — not a thrown Error — so the browser
    // gets a real response instead of a network error that masks the root cause.
    return callback(
      Object.assign(new Error(`CORS: Origin '${origin}' is not allowed.`), {
        status: 403,
        code: 'CORS_ORIGIN_BLOCKED',
      })
    );
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Tell browsers they can cache the preflight result for 10 minutes.
  // This reduces preflight round-trips and avoids repeated 521 failures
  // during a cold-start window.
  maxAge: 600,
};

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet());

// OPTIONS preflight MUST be handled BEFORE any other middleware.
// If it reaches the rate-limiter or auth middleware first, preflight fails.
app.options('*', cors(corsOptions));
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

// ── Health check ──────────────────────────────────────────────────────────────
// Used by:
//   1. Render's own health check (configure in Render dashboard: path = /health)
//   2. Your frontend keep-alive ping (see api.js) to prevent cold starts
//   3. External uptime monitors (UptimeRobot, BetterStack — free tier available)
//
// This endpoint intentionally bypasses the generalLimiter so pings never
// consume rate-limit budget.
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── 404 handler for unknown routes ───────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'The requested resource does not exist.' },
  });
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(
    `MeloStream server running on port ${config.port} [${config.nodeEnv}]`
  );
  logger.info(`[CORS] Allowed origins: ${[...allowedOrigins].join(', ')}`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Render sends SIGTERM before forcefully killing the process.
// This lets in-flight requests finish before the process exits.
process.on('SIGTERM', () => {
  logger.info('[Server] SIGTERM received — shutting down gracefully.');
  server.close(() => {
    logger.info('[Server] HTTP server closed.');
    process.exit(0);
  });

  // Hard kill after 10s if connections are still open (stuck uploads, etc.)
  setTimeout(() => {
    logger.error('[Server] Forced shutdown after 10s timeout.');
    process.exit(1);
  }, 10_000);
});

process.on('SIGINT', () => {
  logger.info('[Server] SIGINT received — shutting down gracefully.');
  server.close(() => process.exit(0));
});

// Log unhandled promise rejections — never let them silently crash the process
process.on('unhandledRejection', (reason) => {
  logger.error('[Server] Unhandled promise rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('[Server] Uncaught exception:', err);
  // Exit so Render restarts the process cleanly
  process.exit(1);
});

module.exports = app;