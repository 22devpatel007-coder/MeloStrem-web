/**
 * server/src/services/activityLogger.js
 *
 * Structured activity logger for MeloStream.
 * Every user-facing event is logged as a single JSON line via Winston.
 *
 * Usage:
 *   const activity = require('../services/activityLogger');
 *   activity.log('song_play', req, { songId, stage: 'started' });
 *
 * Every event automatically includes:
 *   - event        : the event name (snake_case)
 *   - uid          : from req.user?.uid (null for public routes)
 *   - correlationId: from req.correlationId (set by correlationId middleware)
 *   - ip           : req.ip
 *   - userAgent    : req.headers['user-agent']
 *   - timestamp    : ISO 8601
 *   - environment  : NODE_ENV
 *
 * Additional fields are passed via the `meta` object.
 */

'use strict';

const logger = require('../utils/logger');

/**
 * Log a structured activity event.
 *
 * @param {string}                      event  - snake_case event name
 * @param {import('express').Request}   req    - Express request (for uid, correlationId, ip)
 * @param {object}                      [meta] - additional event-specific fields
 */
function log(event, req, meta = {}) {
  try {
    const payload = {
      event,
      uid:           req?.user?.uid          ?? null,
      correlationId: req?.correlationId      ?? null,
      ip:            req?.ip                 ?? null,
      userAgent:     req?.headers?.['user-agent'] ?? null,
      timestamp:     new Date().toISOString(),
      environment:   process.env.NODE_ENV   ?? 'development',
      ...meta,
    };

    logger.info(`[activity] ${event}`, payload);
  } catch {
    // Never let the logger crash the request
  }
}

// ── Named helpers (avoids magic string typos at call sites) ───────────────────

// Auth
const user_signup  = (req, meta) => log('user_signup',  req, meta);
const user_login   = (req, meta) => log('user_login',   req, meta);
const user_logout  = (req, meta) => log('user_logout',  req, meta);
const failed_login = (req, meta) => log('failed_login', req, meta);
const token_refresh = (req, meta) => log('token_refresh', req, meta);

// Songs
const song_upload  = (req, meta) => log('song_upload',  req, meta);
const song_delete  = (req, meta) => log('song_delete',  req, meta);
const song_edit    = (req, meta) => log('admin_song_edit', req, meta);
const song_play    = (req, meta) => log('song_play',    req, meta);  // meta.stage: started|counted|completed
const song_like    = (req, meta) => log('song_like',    req, meta);
const song_unlike  = (req, meta) => log('song_unlike',  req, meta);

// Playlists
const playlist_create = (req, meta) => log('playlist_create', req, meta);
const playlist_delete = (req, meta) => log('playlist_delete', req, meta);
const playlist_edit   = (req, meta) => log('admin_playlist_edit', req, meta);

// Search
const search_performed = (req, meta) => log('search_performed', req, meta);

// Suggestions
const suggestion_submitted     = (req, meta) => log('suggestion_submitted',     req, meta);
const suggestion_status_changed = (req, meta) => log('suggestion_status_changed', req, meta);

// Infrastructure
const rate_limit_triggered     = (req, meta) => log('rate_limit_triggered',     req, meta);
const upload_failed            = (req, meta) => log('upload_failed',            req, meta);
const session_picks_flushed    = (req, meta) => log('session_picks_flushed',    req, meta);
const duplicate_check_triggered = (req, meta) => log('duplicate_check_triggered', req, meta);
const cache_miss               = (req, meta) => log('cache_miss',               req, meta);

module.exports = {
  log,
  user_signup,
  user_login,
  user_logout,
  failed_login,
  token_refresh,
  song_upload,
  song_delete,
  song_edit,
  song_play,
  song_like,
  song_unlike,
  playlist_create,
  playlist_delete,
  playlist_edit,
  search_performed,
  suggestion_submitted,
  suggestion_status_changed,
  rate_limit_triggered,
  upload_failed,
  session_picks_flushed,
  duplicate_check_triggered,
  cache_miss,
};