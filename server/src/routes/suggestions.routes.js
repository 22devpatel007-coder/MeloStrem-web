/**
 * server/src/routes/suggestions.routes.js
 *
 * POST /api/suggestions  — authenticated user, rate limited, 24hr Firestore guard
 * GET  /api/suggestions  — admin only (verifyTokenStrict + isAdmin)
 *
 * Middleware chains match the patterns in playlists.routes.js and users.routes.js.
 */

const express  = require('express');
const router   = express.Router();

const { verifyToken, verifyTokenStrict } = require('../middleware/verifyToken');
const isAdmin   = require('../middleware/isAdmin');
const { suggestionsLimiter }             = require('../middleware/rateLimiter');
const { submit, list, listMine, updateStatus } = require('../controllers/suggestions.controller');
const { validateSubmitSuggestion, validateUpdateSuggestion } = require('../validators/suggestion.validator');

// POST /api/suggestions
// Chain: suggestionsLimiter → verifyToken → validateSubmitSuggestion → submit
router.post(
  '/',
  suggestionsLimiter,
  verifyToken,
  validateSubmitSuggestion,
  submit
);

// GET /api/suggestions/mine
// Chain: verifyToken → mySuggestions (must come BEFORE /:id)
router.get(
  '/mine',
  verifyToken,
  listMine
);

// GET /api/suggestions
// Chain: verifyTokenStrict → isAdmin → list
router.get(
  '/',
  verifyTokenStrict,
  isAdmin,
  list
);
// PATCH /api/suggestions/:id
// Chain: verifyTokenStrict → isAdmin → validateUpdateSuggestion → updateStatus
router.patch(
  '/:id',
  verifyTokenStrict,
  isAdmin,
  validateUpdateSuggestion,
  updateStatus
);
module.exports = router;