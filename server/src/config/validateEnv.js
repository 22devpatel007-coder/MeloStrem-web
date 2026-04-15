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
//
// Task 2.5 addition:
//  • FIRESTORE_INDEXES_VERIFIED warning: warns (does NOT exit) when the deployer
//    has not confirmed that Firestore composite indexes are built before deploying
//    code that depends on them. Indexes take 10–30 minutes to build on large
//    collections — deploying code before indexes are ready causes query failures.
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();

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
 * Also warns (without exiting) if FIRESTORE_INDEXES_VERIFIED is not set in
 * production. This forces the deployer to consciously confirm that Firestore
 * composite indexes have finished building before traffic is routed to the
 * new deployment. Index build time: 10–30 minutes for large collections.
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

  if (missing.length > 0) {
    // ── Fatal: one or more vars are missing ──────────────────────────────────
    console.error("\nFATAL — Missing required environment variables:\n");
    console.error(
      `[validateEnv] Environment: ${nodeEnv}\n` +
        `[validateEnv] ${missing.length} missing variable(s):\n` +
        missing.map((key) => `  ✗  ${key}`).join("\n") +
        "\n"
    );
    console.error(
      "[validateEnv] Action required:\n" +
        "  • Local dev:   add missing vars to your .env file\n" +
        "  • Render:      add missing vars in the Environment tab of your service\n" +
        "  • CI/CD:       add missing vars as repository or environment secrets\n" +
        "\n" +
        "  See server/.env.example for the full list of supported variables.\n"
    );
    // Exit before any port is bound — fail fast, fail loud.
    process.exit(1);
  }

  // ── All required vars present ───────────────────────────────────────────────
  // Use console.info here (not logger) because logger itself may depend on
  // env vars and is not yet initialized when validateEnv() runs.
  console.info(
    `[validateEnv] ✓ All ${required.length} required environment variables are present. ` +
      `(env=${nodeEnv})`
  );

  // ── Task 2.5: Firestore index verification guard ────────────────────────────
  //
  // Composite Firestore indexes do NOT fail at server startup — they fail at
  // RUNTIME when the first query that needs the index is executed. On a large
  // collection (10,000+ songs) a missing index causes:
  //   FirebaseError: The query requires an index. You can create it here: <url>
  //
  // This warning forces the deployer to set FIRESTORE_INDEXES_VERIFIED=true in
  // their deployment environment AFTER confirming indexes are built in the
  // Firebase console. It does NOT block startup — it is a loud warning only.
  //
  // How to set:
  //   • Render:    add FIRESTORE_INDEXES_VERIFIED=true in Environment tab
  //   • Local dev: add to .env (or ignore — indexes are always ready locally)
  //   • CI/CD:     add as a deployment step gate after `firebase deploy --only firestore:indexes`
  //
  // When to suppress:
  //   • Only set FIRESTORE_INDEXES_VERIFIED=true after you have deployed
  //     firestore.indexes.json AND all indexes show "Enabled" in the Firebase console.
  //   • Index build time: 1–5 minutes for small collections, 10–30 minutes for 10k+ docs.
  // ─────────────────────────────────────────────────────────────────────────────
  if (isProduction) {
    const indexesVerified = process.env.FIRESTORE_INDEXES_VERIFIED;
    const isVerified =
      indexesVerified !== undefined &&
      indexesVerified !== null &&
      indexesVerified.trim().toLowerCase() === "true";

    if (!isVerified) {
      console.warn(
        "\n[validateEnv] ⚠  WARNING — FIRESTORE_INDEXES_VERIFIED is not set.\n" +
          "\n" +
          "  Composite Firestore indexes are required for production query performance.\n" +
          "  Without verified indexes, queries on 10,000+ songs will fail at runtime\n" +
          "  with: FirebaseError: The query requires an index.\n" +
          "\n" +
          "  Required steps before setting this flag:\n" +
          "  1. Deploy indexes:  firebase deploy --only firestore:indexes\n" +
          "  2. Wait for build:  open Firebase console → Firestore → Indexes\n" +
          "                      all indexes must show status 'Enabled' (not 'Building')\n" +
          "  3. Set env var:     FIRESTORE_INDEXES_VERIFIED=true\n" +
          "  4. Redeploy server\n" +
          "\n" +
          "  This is a WARNING only — server will continue starting up.\n" +
          "  Do NOT route production traffic until indexes are verified.\n"
      );
    } else {
      console.info(
        "[validateEnv] ✓ FIRESTORE_INDEXES_VERIFIED=true — index build confirmed by deployer."
      );
    }
  }
  // In non-production environments (local dev, staging with emulator),
  // skip the index verification check — Firestore emulator auto-creates
  // all indexes on first query and never requires a build wait.
}

module.exports = { validateEnv };