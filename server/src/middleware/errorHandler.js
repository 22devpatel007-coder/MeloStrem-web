const logger = require('../utils/logger');
const errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path });
  const statusCode = err.statusCode || err.status || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'An unexpected error occurred';
  return res.status(statusCode).json({ success: false, error: { message, code } });
}

module.exports = errorHandler;