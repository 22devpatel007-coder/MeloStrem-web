/**
 * server/src/routes/jamendo.routes.js
 *
 * Public, read-only routes for the Jamendo (Creative Commons) music source.
 * No auth required — this is public catalog discovery, same trust level as
 * GET /api/songs and GET /api/search.
 *
 * Rate-limited independently from the general song endpoints because every
 * request here proxies to a third-party API with its own quota — we must
 * not let this domain exhaust the shared quota or let a caller hammer
 * Jamendo through us. See middleware/rateLimiter.js for jamendoLimiter definition.
 */

'use strict';

const express = require('express');
const router = express.Router();

const jamendoController = require('../controllers/jamendo.controller');
const { jamendoLimiter } = require('../middleware/rateLimiter');

// GET /api/jamendo/search?q=<term>&tags=<tags>&limit=<n>&offset=<n>
router.get('/search', jamendoLimiter, jamendoController.search);

// GET /api/jamendo/tracks/:id
// Declared after /search so Express never treats 'search' as an :id param.
router.get('/tracks/:id', jamendoLimiter, jamendoController.getTrackById);

module.exports = router;