const express = require('express');
const router = express.Router();
const { searchSongs } = require('../controllers/search.controller');
const { searchLimiter } = require('../middleware/rateLimiter');

// GET /api/search?q=<term>&limit=<number>
// Public — no auth required for search
router.get('/', searchLimiter, searchSongs);

module.exports = router;
