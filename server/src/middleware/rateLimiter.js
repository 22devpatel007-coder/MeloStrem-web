const rateLimit = require('express-rate-limit');

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMIT_EXCEEDED' } },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Upload limit exceeded', code: 'UPLOAD_LIMIT_EXCEEDED' } },
});

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Search rate limit exceeded', code: 'SEARCH_LIMIT_EXCEEDED' } },
});

module.exports = {
  generalLimiter,
  uploadLimiter,
  searchLimiter
};
