/**
 * server/src/validators/song.validator.js
 *
 * Phase 1 — Task 1.2: Added max-length caps to every string field.
 *
 * Changes from previous version:
 *   title   — added .max(200)
 *   artist  — added .max(150)
 *   album   — added .max(200)
 *   genre   — added .max(100)
 *
 * All other logic (required/optional rules, .unknown(true), sendError call,
 * error code 'VALIDATION_ERROR') is IDENTICAL to the previous version.
 *
 * NOTE: sendError is kept here for now (pre-Phase-2). After Task 1.1's
 * AppError classes land these validators will be updated to throw
 * ValidationError instead of calling sendError directly.
 */

const Joi = require('joi');
const { sendError } = require('../utils/apiResponse');

const validateCreateSong = (req, res, next) => {
  const schema = Joi.object({
    title:    Joi.string().max(200).required(),
    artist:   Joi.string().max(150).required(),
    album:    Joi.string().max(200).allow('', null).optional(),
    duration: Joi.number().optional(),
    tags:     Joi.array().items(Joi.string().max(30).trim()).max(10).optional(),
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

const validateUpdateSong = (req, res, next) => {
  const schema = Joi.object({
    title:    Joi.string().max(200).optional(),
    artist:   Joi.string().max(150).optional(),
    album:    Joi.string().max(200).allow('', null).optional(),
    duration: Joi.number().optional(),
    tags:     Joi.array().items(Joi.string().max(30).trim()).max(10).optional(),
    featured: Joi.boolean().optional(),
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

module.exports = {
  validateCreateSong,
  validateUpdateSong,
};