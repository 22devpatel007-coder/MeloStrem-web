'use strict';

const config = require('../config/index');
const logger = require('../utils/logger');

const JAMENDO_BASE_URL = 'https://api.jamendo.com/v3.0';
const REQUEST_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 300;

// Jamendo's documented hard cap is 200 results per request. Verify this
// against current Jamendo API docs periodically — third-party API limits
// can change without notice, and this file has no way to detect that on
// its own. If Jamendo ever tightens this, requests above their real cap
// will simply come back with fewer results than requested (handled
// gracefully below via hasMore), not an error.
const MAX_JAMENDO_LIMIT = 200;

// Only forward whitelisted order values to Jamendo. Prevents passing
// arbitrary/garbage strings upstream and keeps behavior predictable.
const VALID_ORDER_VALUES = new Set([
  'relevance',
  'popularity_total',
  'popularity_month',
  'popularity_week',
  'releasedate_desc',
  'releasedate_asc',
]);

class JamendoConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'JamendoConfigError';
    this.isOperational = true;
    this.statusCode = 503;
    this.code = 'JAMENDO_NOT_CONFIGURED';
  }
}

class JamendoUpstreamError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = 'JamendoUpstreamError';
    this.isOperational = true;
    this.statusCode = statusCode;
    this.code = 'JAMENDO_UPSTREAM_ERROR';
  }
}

/** @private */
function _assertConfigured() {
  const clientId = config.jamendo && config.jamendo.clientId;
  if (!clientId) {
    throw new JamendoConfigError(
      'Jamendo integration is not configured (missing JAMENDO_CLIENT_ID env var).',
    );
  }
  return clientId;
}

/** @private */
function _sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** @private */
async function _fetchJamendo(path, params = {}) {
  const clientId = _assertConfigured();

  const query = new URLSearchParams({
    client_id: clientId,
    format: 'json',
    ...params,
  });

  const url = `${JAMENDO_BASE_URL}${path}?${query.toString()}`;

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeout);

      if (response.status >= 500) {
        throw new JamendoUpstreamError(`Jamendo API returned ${response.status}`, 502);
      }

      if (!response.ok) {
        throw new JamendoUpstreamError(
          `Jamendo API request failed with status ${response.status}`,
          response.status === 429 ? 429 : 502,
        );
      }

      const body = await response.json();

      if (body?.headers?.status === 'failed') {
        throw new JamendoUpstreamError(
          `Jamendo API error: ${body.headers.error_message || 'unknown error'}`,
          502,
        );
      }

      return body;
    } catch (err) {
      clearTimeout(timeout);
      lastError = err;

      const isAbort = err.name === 'AbortError';
      const isRetryable = isAbort || (err instanceof JamendoUpstreamError && err.statusCode === 502);

      if (!isRetryable || attempt === MAX_RETRIES) break;

      const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
      logger.warn('jamendoService: retrying after transient failure', {
        attempt: attempt + 1,
        delay,
        error: err.message,
      });
      await _sleep(delay);
    }
  }

  if (lastError instanceof JamendoUpstreamError) throw lastError;

  throw new JamendoUpstreamError(
    `Jamendo API unreachable: ${lastError?.message || 'unknown network error'}`,
    503,
  );
}

/** @private — unchanged from original */
function mapJamendoTrackToSong(track) {
  if (!track || typeof track !== 'object') return null;

  const id = track.id != null ? `jamendo:${track.id}` : '';
  const title = typeof track.name === 'string' ? track.name.trim() : '';
  const artist = typeof track.artist_name === 'string' ? track.artist_name.trim() : '';
  const duration = typeof track.duration === 'number' ? track.duration : 0;

  const audioUrl =
    typeof track.audiodownload === 'string' && track.audiodownload
      ? track.audiodownload
      : typeof track.audio === 'string'
        ? track.audio
        : '';

  const coverUrl = typeof track.image === 'string' ? track.image : '';
  const licenseCcUrl = typeof track.license_ccurl === 'string' ? track.license_ccurl : '';

  if (!id || !title || !audioUrl) return null;

  return {
    id,
    title,
    artist,
    tags: [],
    album: typeof track.album_name === 'string' ? track.album_name.trim() : '',
    duration,
    audioUrl,
    fileUrl: audioUrl,
    coverUrl,
    storagePath: '',
    coverStoragePath: '',
    titleLower: title.toLowerCase(),
    artistLower: artist.toLowerCase(),
    artistId: null,
    albumId: null,
    trackNumber: null,
    playCount: 0,
    featured: false,
    uploadedBy: '',
    createdAt: null,
    updatedAt: null,
    source: 'jamendo',
    license: {
      name: 'Creative Commons',
      ccUrl: licenseCcUrl,
      attributionRequired: true,
      attributionText: artist
        ? `Music by ${artist} (via Jamendo, Creative Commons)`
        : 'Music via Jamendo, Creative Commons',
    },
  };
}

/**
 * searchJamendoTracks({ query, tags, order, limit, offset })
 *   → { songs, total, query, hasMore, nextOffset }
 *
 * PAGINATION NOTE:
 *   Jamendo's /tracks/ endpoint does not return a "total matches" figure —
 *   only the page you asked for. There is no keyless way to know the true
 *   size of the result set up front. The correct, standard pattern for this
 *   (used by many APIs with the same limitation) is:
 *     - hasMore = true iff the upstream call returned a FULL page
 *       (rawResults.length === safeLimit). A short page means we've hit
 *       the end of what Jamendo has for this query.
 *     - nextOffset = offset + rawResults.length, to request from callers.
 *   This lets the frontend keep calling "load more" until Jamendo itself
 *   signals exhaustion, which is the only reliable way to get "everything
 *   the API provides" for a given search/tag.
 *
 *   `total` here is intentionally just "how many songs are in *this*
 *   response" (kept for backward compatibility with existing callers) —
 *   it is NOT a grand total across pages. Use `hasMore`/`nextOffset` for
 *   pagination decisions, not `total`.
 */
async function searchJamendoTracks({
  query = '',
  tags = '',
  order = '',
  limit = 20,
  offset = 0,
} = {}) {
  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), MAX_JAMENDO_LIMIT);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const trimmedQuery = typeof query === 'string' ? query.trim() : '';
  const trimmedTags = typeof tags === 'string' ? tags.trim() : '';
  const trimmedOrder = typeof order === 'string' ? order.trim() : '';

  const params = {
    limit: String(safeLimit),
    offset: String(safeOffset),
    audioformat: 'mp32',
    include: 'musicinfo',
  };

  if (trimmedQuery) params.namesearch = trimmedQuery;
  if (trimmedTags) params.tags = trimmedTags;

  // Browsing with no search term and no tag ("All", nothing typed) has no
  // natural relevance ranking — default to popularity so the page isn't
  // arbitrary/empty-feeling. If the caller passed an explicit valid order,
  // respect it instead.
  if (trimmedOrder && VALID_ORDER_VALUES.has(trimmedOrder)) {
    params.order = trimmedOrder;
  } else if (!trimmedQuery && !trimmedTags) {
    params.order = 'popularity_total';
  }

  const body = await _fetchJamendo('/tracks/', params);

  const rawResults = Array.isArray(body?.results) ? body.results : [];
  const songs = rawResults.map(mapJamendoTrackToSong).filter(Boolean);

  return {
    songs,
    total: songs.length,
    query: trimmedQuery,
    hasMore: rawResults.length === safeLimit,
    nextOffset: safeOffset + rawResults.length,
  };
}

async function getJamendoTrackById(jamendoId) {
  const cleanId = String(jamendoId).replace(/^jamendo:/, '').trim();
  if (!cleanId) return null;

  const body = await _fetchJamendo('/tracks/', {
    id: cleanId,
    audioformat: 'mp32',
    include: 'musicinfo',
  });

  const rawResults = Array.isArray(body?.results) ? body.results : [];
  if (rawResults.length === 0) return null;

  return mapJamendoTrackToSong(rawResults[0]);
}

module.exports = {
  searchJamendoTracks,
  getJamendoTrackById,
  mapJamendoTrackToSong,
  JamendoConfigError,
  JamendoUpstreamError,
  MAX_JAMENDO_LIMIT,
  VALID_ORDER_VALUES,
};