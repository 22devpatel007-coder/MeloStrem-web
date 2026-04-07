const Joi = require('joi');
const { sendError } = require('../utils/apiResponse');

const validateCreateSong = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().required(),
    artist: Joi.string().required(),
    album: Joi.string().allow('', null).optional(),
    duration: Joi.number().optional(),
    genre: Joi.string().required() // added genre since it's required in controller
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

const validateUpdateSong = (req, res, next) => {
  const schema = Joi.object({
    title: Joi.string().optional(),
    artist: Joi.string().optional(),
    album: Joi.string().allow('', null).optional(),
    duration: Joi.number().optional(),
    genre: Joi.string().optional(),
    featured: Joi.boolean().optional()
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

module.exports = {
  validateCreateSong,
  validateUpdateSong
};
