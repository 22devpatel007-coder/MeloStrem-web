/**
 * server/src/routes/errors.routes.js
 *
 * PHASE 4 — TASK 4.2: Frontend Error Reporting Route
 *
 * ROUTE:
 *   POST /api/errors/report
 *
 * MIDDLEWARE CHAIN (matches the thin-route convention in CLAUDE.md §6):
 *   1. errorReportLimiter  — 20 req / 1 min per IP  (abuse defence)
 *   2. receiveErrorReports — controller (validate + log)
 *
 * NO AUTH MIDDLEWARE:
 *   This endpoint is intentionally public. Error reports must be receivable
 *   from unauthenticated states:
 *     - The login page crashing before any Firebase token exists
 *     - A token refresh failure that left the user in a signed-out state
 *     - The AppErrorBoundary firing during cold app startup
 *   The rate limiter (20/min per IP) is the abuse defence in place of auth.
 *
 * NO BODY SIZE CONCERN:
 *   express.json() is already mounted globally in server/src/index.js with a
 *   default body size limit (100kb). A 20-report batch with all fields fully
 *   populated is well under 50kb, so no override is needed here.
 */

const express                 = require('express');
const { errorReportLimiter }  = require('../middleware/rateLimiter');
const { receiveErrorReports } = require('../controllers/errors.controller');

const router = express.Router();

// POST /api/errors/report
router.post('/report', errorReportLimiter, receiveErrorReports);

module.exports = router;