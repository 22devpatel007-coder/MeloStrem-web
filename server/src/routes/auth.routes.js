const express = require('express');
const router = express.Router();
const verifyToken = require('../middleware/verifyToken');
const authController = require('../controllers/auth.controller');

router.post('/verify', verifyToken, authController.verifyUser);

module.exports = router;
