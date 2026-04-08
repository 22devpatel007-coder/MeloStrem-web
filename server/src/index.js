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
//   CLIENT_ORIGIN=https://music-web-gamma-eight.vercel.app,http://localhost:3000
//
// This lets you allowlist both your production Vercel URL and local dev
// without changing code — just update the env var on Render.
const rawOrigins = (config.clientOrigin || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const allowedOrigins = new Set(rawOrigins);

// Always allow localhost in development
if (config.nodeEnv !== 'production') {
  allowedOrigins.add('http://localhost:3000');
  allowedOrigins.add('http://127.0.0.1:3000');
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, Postman, mobile apps)
    if (!origin) return callback(null, true);

    if (allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    logger.warn(`[CORS] Blocked request from origin: ${origin}`);
    return callback(new Error(`CORS: Origin '${origin}' is not allowed.`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // Handle pre-flight for all routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(generalLimiter);

// ── Health check (useful for Render uptime pings to prevent cold starts) ──────
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API routes ────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ── Global error handler ──────────────────────────────────────────────────────
app.use(errorHandler);

// ── Start server ──────────────────────────────────────────────────────────────
const server = app.listen(config.port, () => {
  logger.info(
    `MeloStream server running on port ${config.port} [${config.nodeEnv}]`
  );
  logger.info(`[CORS] Allowed origins: ${[...allowedOrigins].join(', ')}`);
});

// Graceful shutdown — prevents abrupt kills from Render cycling
process.on('SIGTERM', () => {
  logger.info('[Server] SIGTERM received — shutting down gracefully.');
  server.close(() => {
    logger.info('[Server] HTTP server closed.');
    process.exit(0);
  });
});

module.exports = app;