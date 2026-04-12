/**
 * server/src/config/firebase.js  — PRODUCTION READY
 *
 * FIXES:
 *  1. EHOSTUNREACH (IPv6) — gRPC DNS + preferRest bypass
 *  2. ECONNRESET / ETIMEDOUT — custom HTTPS agent with socket keepalive
 *
 * ── Why ECONNRESET still happened even with preferRest: true ─────────────────
 *
 * preferRest: true switches Firestore from gRPC to standard HTTPS REST.
 * However, Node.js's default https.globalAgent has keepAlive: false, meaning
 * sockets are closed after each request and reopened on the next one.
 * Render.com (and most PaaS platforms) impose a ~10-minute idle TCP timeout
 * at the infrastructure level. Even with keep-alive sockets, if no traffic
 * flows for several minutes, Render silently kills the TCP connection from
 * its side. The next Firestore call finds a half-open socket — the client
 * believes it's alive, the server has already closed it — resulting in:
 *
 *   ECONNRESET  — remote closed the connection mid-stream
 *   ETIMEDOUT   — socket never gets a response
 *   "Client network socket disconnected before secure TLS connection"
 *
 * Fix — custom https.Agent with three settings:
 *
 *   keepAlive: true
 *     Instructs Node.js to send TCP keep-alive probes on idle sockets,
 *     preventing infrastructure from treating them as dead connections.
 *
 *   keepAliveMsecs: 30_000  (30s)
 *     How often to send TCP keep-alive probes. Must be well under Render's
 *     ~10 minute idle kill threshold. 30s is conservative and safe.
 *
 *   timeout: 20_000  (20s)
 *     Socket-level read timeout. If Firestore doesn't respond within 20s,
 *     Node destroys the socket and throws — letting retryFirestore catch it
 *     and retry on a fresh socket, rather than hanging indefinitely.
 *
 * This agent is injected via db.settings({ httpAgent }) so it applies to
 * every Firestore REST call made by the Admin SDK.
 *
 * No new npm dependencies. https is Node.js built-in.
 */

'use strict';

const https  = require('https');
const admin  = require('firebase-admin');
const config = require('./index');

// ── Must be set before initializeApp so gRPC C-core picks it up ──────────────
// Kept as a safety net in case preferRest is ever toggled off accidentally.
process.env.GRPC_DNS_RESOLVER = 'native';

// ── Custom HTTPS agent — keepalive + socket timeout ───────────────────────────
// Shared across all Firestore REST connections from this process.
const firestoreHttpAgent = new https.Agent({
  keepAlive:      true,   // send TCP keep-alive probes on idle sockets
  keepAliveMsecs: 30_000, // probe every 30s — well under Render's idle kill
  timeout:        20_000, // destroy socket if no response in 20s
  maxSockets:     25,     // cap concurrent sockets; Firestore REST is stateless
});

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

// ── REST transport + custom agent ─────────────────────────────────────────────
// preferRest: true  — bypass gRPC entirely (no IPv6 dependency)
// httpAgent         — inject keepalive agent for all REST calls
db.settings({
  preferRest: true,
  httpAgent:  firestoreHttpAgent,
});

module.exports = { admin, db };