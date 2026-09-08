'use strict';

const {
  searchJamendoTracks,
  getJamendoTrackById,
  JamendoConfigError,
  JamendoUpstreamError,
  MAX_JAMENDO_LIMIT,
  VALID_ORDER_VALUES,
} = require('../services/jamendoService');
const cache = require('../services/cache.service');
const logger = require('../utils/logger');

const INTERNAL_ERROR = 'Something went wrong. Please try again.';

const JAMENDO_SEARCH_TTL = cache.TTL.SEARCH || 30;
const JAMENDO_TRACK_TTL = cache.TTL.SONG || 300;

const cacheKeys = {
  search: (query, tags, order, limit, offset) =>
    `jamendo:search:${query || ''}:${tags || ''}:${order || ''}:${limit}:${offset}`,
  track: (id) => `jamendo:track:${id}`,
};

const logMeta = (req) => ({
  correlationId: req.correlationId,
  userId: req.user?.uid ?? null,
});

function _handleJamendoError(err, req, res, label) {
  if (err instanceof JamendoConfigError) {
    logger.error(`${label} config error`, { ...logMeta(req), error: err.message });
    return res.status(503).json({ error: 'Music discovery is temporarily unavailable.', code: err.code });
  }
  if (err instanceof JamendoUpstreamError) {
    logger.warn(`${label} upstream error`, { ...logMeta(req), error: err.message, statusCode: err.statusCode });
    return res.status(err.statusCode === 429 ? 429 : 502).json({
      error: 'Music discovery service is temporarily unavailable. Please try again shortly.',
      code: err.code,
    });
  }
  logger.error(`${label} error`, { ...logMeta(req), error: err.message });
  return res.status(500).json({ error: INTERNAL_ERROR, code: 'INTERNAL_ERROR' });
}

// ── GET /api/jamendo/search ────────────────────────────────────────────────
exports.search = async (req, res) => {
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const tags = typeof req.query.tags === 'string' ? req.query.tags.trim() : '';
  const rawOrder = typeof req.query.order === 'string' ? req.query.order.trim() : '';
  const order = VALID_ORDER_VALUES.has(rawOrder) ? rawOrder : '';
  const limit = Math.min(parseInt(req.query.limit, 10) || 20, MAX_JAMENDO_LIMIT);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);

  const key = cacheKeys.search(query, tags, order, limit, offset);

  try {
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    const result = await searchJamendoTracks({ query, tags, order, limit, offset });

    if (result.songs.length > 0) {
      cache.set(key, result, JAMENDO_SEARCH_TTL);
    }

    return res.json(result);
  } catch (err) {
    return _handleJamendoError(err, req, res, 'jamendo.search');
  }
};

// ── GET /api/jamendo/tracks/:id ────────────────────────────────────────────
exports.getTrackById = async (req, res) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string' || !id.trim()) {
    return res.status(400).json({ error: 'Track id is required', code: 'VALIDATION_ERROR' });
  }

  const key = cacheKeys.track(id.trim());

  try {
    const cached = cache.get(key);
    if (cached !== null) {
      return res.json(cached);
    }

    const song = await getJamendoTrackById(id.trim());
    if (!song) {
      return res.status(404).json({ error: 'Track not found', code: 'NOT_FOUND' });
    }

    cache.set(key, song, JAMENDO_TRACK_TTL);
    return res.json(song);
  } catch (err) {
    return _handleJamendoError(err, req, res, 'jamendo.getTrackById');
  }
};