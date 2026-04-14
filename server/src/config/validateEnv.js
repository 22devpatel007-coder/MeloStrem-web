"use strict";

// ─── server/src/config/validateEnv.js ────────────────────────────────────────
//
// Startup environment variable guard for MeloStream API server.
//
// Call this as the FIRST line of server/src/index.js, before any other imports
// or middleware registration. If any required variable is missing, the process
// exits immediately with a clear error listing every missing variable.
//
// Why this matters at scale:
//  • A missing FIREBASE_PROJECT_ID causes runtime errors on the FIRST request,
//    not at startup — meaning the server appears healthy but crashes under load.
//  • A missing CLOUDINARY_API_KEY causes silent upload failures hours after
//    deployment, with no obvious connection to the missing variable.
//  • process.exit(1) at startup is always safer than a broken server silently
//    serving 500s to real users.
//
// How to extend:
//  • Add new required vars to ALWAYS_REQUIRED or PRODUCTION_ONLY arrays below.
//  • Do NOT add optional vars here — only vars whose absence causes a crash.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Variables required in ALL environments (development, staging, production).
 * These are the absolute minimum for the server to function at all.
 */
const ALWAYS_REQUIRED = [
  "PORT",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_PRIVATE_KEY",
  "FIREBASE_CLIENT_EMAIL",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
];

/**
 * Variables required ONLY in production.
 * In local development these may be intentionally absent (e.g. CLIENT_ORIGIN
 * is injected from localhost defaults in index.js instead).
 */
const PRODUCTION_ONLY = [
  "CLIENT_ORIGIN",
  "ALLOWED_ORIGINS",
];

// ─────────────────────────────────────────────────────────────────────────────
// Validation logic
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Validates that all required environment variables are present.
 * Calls process.exit(1) if any are missing — never throws, never returns false.
 *
 * Must be called before any other module import that reads process.env,
 * because config/index.js reads env vars at require-time.
 *
 * @returns {void}
 */
function validateEnv() {
  const nodeEnv = process.env.NODE_ENV || "development";
  const isProduction = nodeEnv === "production";

  // Build the full required list based on environment
  const required = isProduction
    ? [...ALWAYS_REQUIRED, ...PRODUCTION_ONLY]
    : [...ALWAYS_REQUIRED];

  // Collect every missing variable in one pass so the error message is
  // complete — no fix-one-restart-find-next-missing loop for the developer.
  const missing = required.filter((key) => {
    const value = process.env[key];
    // Treat empty string as missing — a var set to "" is as broken as unset.
    return value === undefined || value === null || value.trim() === "";
  });

  if (missing.length === 0) {
    // All required vars present — log confirmation and return.
    // Use console.info here (not logger) because logger itself may depend on
    // env vars and is not yet initialized when validateEnv() runs.
    console.info(
      `[validateEnv] ✓ All ${required.length} required environment variables are present. ` +
        `(env=${nodeEnv})`,
    );
    return;
  }

  // ── Fatal: one or more vars are missing ────────────────────────────────────
  console.error(
   "FATAL — Missing required environment variables:\n" 
  );
  console.error(
    `[validateEnv] Environment: ${nodeEnv}\n` +
      `[validateEnv] ${missing.length} missing variable(s):\n` +
      missing.map((key) => `  ✗  ${key}`).join("\n") +
      "\n",
  );

  console.error(
    "[validateEnv] Action required:\n" +
      "  • Local dev:   add missing vars to your .env file\n" +
      "  • Render:      add missing vars in the Environment tab of your service\n" +
      "  • CI/CD:       add missing vars as repository or environment secrets\n" +
      "\n" +
      "  See server/.env.example for the full list of supported variables.\n",
  );

  // Exit before any port is bound — fail fast, fail loud.
  process.exit(1);
}

module.exports = { validateEnv };