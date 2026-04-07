const Joi = require('joi');
const { sendError } = require('../utils/apiResponse');

const validateCreatePlaylist = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().max(100).required(),
    description: Joi.string().max(500).allow('', null).optional(),
    isPublic: Joi.boolean().optional()
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

const validateUpdatePlaylist = (req, res, next) => {
  const schema = Joi.object({
    name: Joi.string().max(100).optional(),
    description: Joi.string().max(500).allow('', null).optional(),
    isPublic: Joi.boolean().optional()
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

module.exports = {
  validateCreatePlaylist,
  validateUpdatePlaylist
};
