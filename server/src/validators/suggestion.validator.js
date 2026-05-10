/**
 * server/src/validators/suggestion.validator.js
 *
 * Joi schema for POST /api/suggestions.
 * Follows the same pattern as song.validator.js and playlist.validator.js.
 */

const Joi = require('joi');

const updateSuggestionSchema = Joi.object({
  status: Joi.string()
    .valid('pending', 'reviewed', 'rejected')
    .required()
    .messages({
      'any.only':     'status must be pending, reviewed, or rejected',
      'any.required': 'status is required',
    }),

  adminMessage: Joi.string()
    .max(300)
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'adminMessage must not exceed 300 characters',
    }),
});

const validateUpdateSuggestion = (req, res, next) => {
  const { error } = updateSuggestionSchema.validate(req.body, { abortEarly: true });
  if (error) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: error.details[0].message },
    });
  }
  next();
};

const ALLOWED_HOSTNAMES = new Set([
  'open.spotify.com',
  'youtube.com',
  'www.youtube.com',
  'music.youtube.com',
  'youtu.be',
]);

const spotifyOrYoutube = (value, helpers) => {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return helpers.error('string.uri');
  }
  if (parsed.protocol !== 'https:') {
    return helpers.error('string.uriCustom');
  }
  if (!ALLOWED_HOSTNAMES.has(parsed.hostname)) {
    return helpers.error('string.platform');
  }
  return value;
};

const submitSuggestionSchema = Joi.object({
  link: Joi.string()
    .max(500)
    .custom(spotifyOrYoutube, 'platform allowlist')
    .required()
    .messages({
      'string.uri':      'link must be a valid URL',
      'string.uriCustom': 'link must use https',
      'string.platform': 'only Spotify and YouTube links are accepted',
      'string.max':      'link must not exceed 500 characters',
      'any.required':    'link is required',
    }),

  playlistName: Joi.string()
    .max(50)
    .allow(null, '')
    .optional()
    .messages({
      'string.max': 'playlistName must not exceed 50 characters',
    }),
});

/**
 * Express middleware — validates req.body against submitSuggestionSchema.
 * On failure: responds 400 with { success: false, error: { code, message } }.
 * On success: calls next().
 */
const validateSubmitSuggestion = (req, res, next) => {
  const { error } = submitSuggestionSchema.validate(req.body, { abortEarly: true });
  if (error) {
    return res.status(400).json({
      success: false,
      error: {
        code:    'VALIDATION_ERROR',
        message: error.details[0].message,
      },
    });
  }
  next();
};

module.exports = { validateSubmitSuggestion, validateUpdateSuggestion };