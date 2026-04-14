/**
 * server/src/validators/playlist.validator.js
 *
 * Phase 1 — Task 1.2: Added max-length caps.
 *
 * Changes from previous version:
 *   name        — already had .max(100), preserved as-is
 *   description — already had .max(500), preserved as-is
 *
 * Both fields already had correct max-length caps from prior work.
 * No Joi schema changes were required. File is reproduced verbatim
 * for completeness and audit trail.
 *
 * NOTE: sendError kept here (pre-Phase-2). After AppError classes land
 * these validators will throw ValidationError instead.
 */

const Joi = require('joi');
const { sendError } = require('../utils/apiResponse');

const validateCreatePlaylist = (req, res, next) => {
  const schema = Joi.object({
    name:        Joi.string().max(100).required(),
    description: Joi.string().max(500).allow('', null).optional(),
    isPublic:    Joi.boolean().optional(),
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

const validateUpdatePlaylist = (req, res, next) => {
  const schema = Joi.object({
    name:        Joi.string().max(100).optional(),
    description: Joi.string().max(500).allow('', null).optional(),
    isPublic:    Joi.boolean().optional(),
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

module.exports = {
  validateCreatePlaylist,
  validateUpdatePlaylist,
};