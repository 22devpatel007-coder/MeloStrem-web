/**
 * server/src/controllers/suggestions.controller.js
 *
 * Thin controller — validates auth shape, delegates to SuggestionService.
 * Follows the same pattern as playlists.controller.js and users.controller.js.
 */

const SuggestionService = require('../services/SuggestionService');
const { sendError }     = require('../utils/apiResponse');
const activity = require('../services/activityLogger');
/**
 * POST /api/suggestions
 * Authenticated user submits a playlist link.
 */
const submit = async (req, res, next) => {
  try {
    const { uid, email } = req.user;
    const { link, playlistName } = req.body;

    const result = await SuggestionService.submit({
      userId:       uid,
      userEmail:    email ?? '',
      link,
      playlistName: playlistName || null,
    });
    activity.suggestion_submitted(req, { uid: req.user.uid, link });
    return res.status(201).json(result);
  } catch (err) {
    if (err.status === 429) {
      return sendError(res, err.message, 429, 'SUGGESTION_LIMIT_EXCEEDED');
    }
    next(err);
  }
};

/**
 * GET /api/suggestions
 * Admin fetches all suggestions.
 */
const list = async (req, res, next) => {
  try {
    const cursor = req.query.cursor || null;
    const limit  = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const result = await SuggestionService.list({ cursor, limit });
    return res.json({ success: true, ...result });
  } catch (err) {
    next(err);
  }
};

const updateStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, adminMessage } = req.body;

    if (!id) return res.status(400).json({ success: false, error: { code: 'MISSING_ID', message: 'Suggestion id is required.' } });

    const result = await SuggestionService.update({ id, status, adminMessage: adminMessage || null });
    activity.suggestion_status_changed(req, { suggestionId: id, newStatus: status });
    return res.json(result);
  } catch (err) {
    if (err.status === 404) return res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: err.message } });
    next(err);
  }
};

const listMine = async (req, res, next) => {
  try {
    const { uid } = req.user;
    const data = await SuggestionService.listByUser(uid);
    return res.json({ success: true, data });
  } catch (err) {
    // Firestore FAILED_PRECONDITION (code 9) = missing composite index.
    // Return 503 instead of crashing with a raw 500 so the client can retry.
    if (
      err.code === 9 ||
      (err.message && err.message.includes('requires an index'))
    ) {
      return res.status(503).json({
        success: false,
        error: {
          code:    'INDEX_NOT_READY',
          message: 'Service temporarily unavailable. Please retry in a few minutes.',
        },
      });
    }
    next(err);
  }
};

module.exports = { submit, list, listMine, updateStatus };