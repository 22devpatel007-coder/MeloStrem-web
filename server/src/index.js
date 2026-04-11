"use strict";

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

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const os = require("os");
const https = require("https");
const http = require("http");

const config = require("./config/index");
const logger = require("./utils/logger");
const routes = require("./routes/index");
const errorHandler = require("./middleware/errorHandler");
const { generalLimiter } = require("./middleware/rateLimiter");

// ─────────────────────────────────────────────────────────────────────────────
// 1. STARTUP VALIDATION
//    Fail fast: cheap checks that catch misconfigured deployments before the
//    server ever starts binding a port.
// ─────────────────────────────────────────────────────────────────────────────

const REQUIRED_ENV = ["PORT"];

// In production every secret must be explicit — no silent fallbacks.
if (config.nodeEnv === "production") {
  REQUIRED_ENV.push("CLIENT_ORIGIN");
}

const missingEnv = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missingEnv.length > 0) {
  console.error(
    `[Startup] FATAL — missing required environment variable(s): ${missingEnv.join(", ")}. Exiting.`,
  );
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. CORS ALLOWLIST
//    CLIENT_ORIGIN accepts a single origin OR comma-separated list:
//      CLIENT_ORIGIN=https://melostream.vercel.app,https://preview-branch.vercel.app
//
//    config.clientOrigin may be a string (old config) or an array (new config).
//    This block handles both safely so no crash occurs during migration.
//
//    Local dev origins are injected automatically in non-production mode.
//    To add a new allowed origin in production: update the env var on Render —
//    no code change required.
// ─────────────────────────────────────────────────────────────────────────────

// ✅ Fix: handle clientOrigin as either array (new config) or string (old config)
const rawOrigins = Array.isArray(config.clientOrigin)
  ? config.clientOrigin
  : (config.clientOrigin || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

const allowedOrigins = new Set(rawOrigins);

if (config.nodeEnv !== "production") {
  ["http://localhost:3000", "http://10.114.74.109:3000"].forEach((o) =>
    allowedOrigins.add(o),
  );
}

if (allowedOrigins.size === 0) {
  logger.warn(
    "[CORS] Allowed origins list is empty — all cross-origin browser " +
      "requests will be blocked. Set CLIENT_ORIGIN.",
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
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
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
app.set("trust proxy", 1);

// ── 4a. Security headers ─────────────────────────────────────────────────────
app.use(helmet());

// ── 4b. CORS ─────────────────────────────────────────────────────────────────
// OPTIONS preflight MUST be handled before any auth/rate-limit middleware fires
// so browsers receive 200 (not 401/429) on preflight requests.
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

// ── 4c. Body parsers ─────────────────────────────────────────────────────────
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

// ── 4d. Global rate limiter ──────────────────────────────────────────────────
app.use(generalLimiter);

// ─────────────────────────────────────────────────────────────────────────────
// 5. SYSTEM ROUTES
//    Placed ABOVE /api so they are never blocked by route-level auth or
//    rate-limit middleware.
// ─────────────────────────────────────────────────────────────────────────────

// ── 5a. Health / liveness probe ──────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    pid: process.pid,
  });
});

// ── 5b. Readiness probe ──────────────────────────────────────────────────────
app.get("/ready", (_req, res) => {
  res.status(200).json({ status: "ready" });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. API ROUTES
// ─────────────────────────────────────────────────────────────────────────────

app.use("/api", routes);

// ─────────────────────────────────────────────────────────────────────────────
// 7. FALLTHROUGH HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    code: "NOT_FOUND",
    message: "The requested resource does not exist.",
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
      `${[...allowedOrigins].join(", ")}`,
  );
});

server.on("error", (err) => {
  logger.error("[Server] Fatal server error:", err);
  gracefulShutdown("SERVER_ERROR");
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. GRACEFUL SHUTDOWN
// ─────────────────────────────────────────────────────────────────────────────

let isShuttingDown = false;

function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[Server] ${signal} received — starting graceful shutdown.`);

  server.close((closeErr) => {
    if (closeErr) {
      logger.error("[Server] Error while closing HTTP server:", closeErr);
      process.exit(1);
    }

    logger.info("[Server] All HTTP connections closed. Exiting cleanly.");
    process.exit(0);
  });

  setTimeout(() => {
    logger.error("[Server] Graceful shutdown timed out (15 s) — forcing exit.");
    process.exit(1);
  }, 15_000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// ─────────────────────────────────────────────────────────────────────────────
// 10. KEEP-ALIVE SELF PING
//     Render free tier spins down after 15 min of inactivity.
//     Pings /health every 14 minutes to keep the server warm.
//     Only runs in production — silent no-op in local dev.
//     Uses BACKEND_URL (your own var) with RENDER_EXTERNAL_URL as fallback.
//     To migrate to a new server: just update BACKEND_URL — no code changes.
// ─────────────────────────────────────────────────────────────────────────────

if (config.nodeEnv === "production") {
  const backendUrl = config.backendUrl;

  if (backendUrl) {
    const pingServer = () => {
      const url = `${backendUrl}/health`;
      const client = url.startsWith("https") ? https : http;

      const req = client.get(url, (res) => {
        if (res.statusCode !== 200) {
          logger.warn(`[keep-alive] Ping returned status ${res.statusCode}`);
        }
      });

      req.on("error", (err) => {
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
    logger.warn("[keep-alive] BACKEND_URL not set — self-ping disabled.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 11. GLOBAL SAFETY NET
// ─────────────────────────────────────────────────────────────────────────────

process.on("unhandledRejection", (reason, promise) => {
  logger.error("[Process] Unhandled promise rejection:", {
    reason,
    promise: promise.toString(),
  });
  if (config.nodeEnv === "production") {
    gracefulShutdown("unhandledRejection");
  }
});

process.on("uncaughtException", (err) => {
  logger.error("[Process] Uncaught exception (fatal):", err);
  gracefulShutdown("uncaughtException");
});

// Export for integration testing (supertest, etc.)
module.exports = app;
