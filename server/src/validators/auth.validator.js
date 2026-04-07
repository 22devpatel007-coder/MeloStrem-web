const Joi = require('joi');
const { sendError } = require('../utils/apiResponse');

const validateRegister = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    name: Joi.string().optional()
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

const validateLogin = (req, res, next) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required()
  }).unknown(true);

  const { error } = schema.validate(req.body);
  if (error) {
    return sendError(res, error.details[0].message, 400, 'VALIDATION_ERROR');
  }
  next();
};

module.exports = {
  validateRegister,
  validateLogin
};
