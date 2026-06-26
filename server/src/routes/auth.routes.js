const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middleware/verifyToken');
const { authVerifyLimiter } = require('../middleware/rateLimiter');
const authController = require('../controllers/auth.controller');

router.post('/verify', authVerifyLimiter, verifyToken, authController.verifyUser);

module.exports = router;