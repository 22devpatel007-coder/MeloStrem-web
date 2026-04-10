/**
 * server/src/config/firebase.js  — PRODUCTION READY
 *
 * BUG FIXED: "14 UNAVAILABLE: No connection established. EHOSTUNREACH 2404:6800:..."
 * ──────────────────────────────────────────────────────────────────────────────
 * Root cause: Firebase Admin SDK defaults to gRPC transport for Firestore.
 * gRPC resolves Google's API hostnames to IPv6 addresses (2404:6800:...).
 * Render.com's infrastructure does not route IPv6 to external services,
 * so every gRPC connection attempt fails with EHOSTUNREACH immediately.
 *
 * Fix — two layers, both required:
 *
 * 1. process.env.GRPC_DNS_RESOLVER = 'native'  (set BEFORE initializeApp)
 *    Forces the gRPC DNS resolver to use the OS native resolver instead of
 *    the c-ares resolver. The native resolver respects /etc/gai.conf and
 *    system IPv4 preference, giving gRPC a chance to fall back to IPv4.
 *    Must be set before the gRPC C-core initialises (i.e. before any
 *    firebase-admin import touches gRPC), which is why it goes at the top
 *    of this file before initializeApp.
 *
 * 2. db.settings({ preferRest: true })  (set AFTER getFirestore())
 *    Switches Firestore SDK from gRPC transport to HTTPS REST transport
 *    entirely. REST calls go to https://firestore.googleapis.com over
 *    standard port 443, which Render routes correctly over IPv4.
 *    This is the definitive fix — gRPC is bypassed completely.
 *    Officially supported by Google; safe for production.
 *    Tradeoff: ~10–20ms extra latency per Firestore call (negligible).
 *
 * No other files need to change. No new dependencies needed.
 */

// ── Must be set before initializeApp so gRPC C-core picks it up ──────────────
process.env.GRPC_DNS_RESOLVER = 'native';

const admin  = require('firebase-admin');
const config = require('./index');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId:   config.firebase.projectId,
      clientEmail: config.firebase.clientEmail,
      privateKey:  config.firebase.privateKey,
    }),
  });
}

const db = admin.firestore();

// ── Force REST transport — bypasses gRPC and its IPv6 dependency entirely ─────
db.settings({ preferRest: true });

module.exports = { admin, db };