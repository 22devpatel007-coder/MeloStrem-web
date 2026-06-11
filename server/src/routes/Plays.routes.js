'use strict';

const express         = require('express');
const router          = express.Router();
const { verifyToken } = require('../middleware/verifyToken');
const { playsLimiter } = require('../middleware/rateLimiter');
const playsController = require('../controllers/plays.controller');

// POST /api/plays/:songId
// Authenticated users only. Rate-limited per user (not per IP) via keyGenerator in playsLimiter.
// Records a valid play event and increments the song's playCount in Firestore.
router.post('/:songId', playsLimiter, verifyToken, playsController.recordPlay);

module.exports = router;