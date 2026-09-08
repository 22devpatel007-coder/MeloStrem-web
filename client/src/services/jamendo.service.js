/**
 * client/src/services/jamendo.service.js
 *
 * Frontend service for the Jamendo (Creative Commons) discovery domain.
 * Mirrors the conventions already established in songs.service.js:
 *   - Uses the shared `api` axios instance (same baseURL, auth interceptor,
 *     retry/401-refresh logic — Jamendo routes are public so the auth header
 *     is simply ignored server-side, but going through `api` costs nothing
 *     and keeps a single network layer for the whole app).
 *   - unwrap() pulls the response body out the same way songs.service.js does.
 *   - Defensive normalizers — never throw, always return safe shapes, mirror
 *     the pattern in extractSong()/extractSongs().
 *
 * IMPORTANT DIFFERENCE FROM songs.service.js:
 *   Jamendo tracks include audioUrl DIRECTLY in the search/list response
 *   (unlike Firestore songs, where audioUrl is stripped from the list and
 *   fetched on-demand via getSongAudioUrl()). This is intentional and safe:
 *     - Jamendo's API already returns the direct streamable URL for free,
 *       there is no equivalent "cheap list, expensive detail" tradeoff to
 *       protect against — the audioUrl costs nothing extra to include.
 *     - playerStore.playSong() already checks `song.audioUrl || song.fileUrl`
 *       BEFORE falling back to getSongAudioUrl(), so a Jamendo track plays
 *       immediately with zero extra network round-trip.
 *   Do NOT strip audioUrl from extractJamendoTrack() — that would force an
 *   unnecessary (and incorrect, since GET /api/songs/:id doesn't know about
 *   Jamendo ids) extra fetch at play time.
 *
 * PAGINATION:
 *   searchJamendo() returns { songs, total, query, hasMore, nextOffset }.
 *   hasMore/nextOffset are what useJamendoSearch.js's useInfiniteQuery uses
 *   to page through Jamendo's catalog — see jamendoService.js (backend) for
 *   why Jamendo has no true "total match count" and hasMore is derived from
 *   whether the last page came back full.
 */
import api from './api';

// ─── Normalizers ───────────────────────────────────────────────────────────

/**
 * Normalizes a single Jamendo track response into the shape SongCard/
 * playerStore/queueStore already expect (same field names as extractSong()).
 * Never throws — returns null only for a genuinely malformed payload.
 */
export const extractJamendoTrack = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[jamendo.service] extractJamendoTrack: unexpected payload', payload);
    return null;
  }

  return {
    id:          typeof payload.id          === 'string' ? payload.id               : '',
    title:       typeof payload.title       === 'string' ? payload.title.trim()     : '',
    artist:      typeof payload.artist      === 'string' ? payload.artist.trim()    : '',
    tags:        Array.isArray(payload.tags) ? payload.tags.map(String) : [],
    album:       typeof payload.album       === 'string' ? payload.album.trim()     : '',
    duration:    typeof payload.duration    === 'number' ? payload.duration         : 0,

    // Included directly — see file header note on why this differs from
    // extractSong() in songs.service.js.
    audioUrl:    typeof payload.audioUrl    === 'string' ? payload.audioUrl         : '',

    coverUrl:    typeof payload.coverUrl    === 'string' ? payload.coverUrl         : '',
    titleLower:  typeof payload.titleLower  === 'string' ? payload.titleLower       : '',
    artistLower: typeof payload.artistLower === 'string' ? payload.artistLower      : '',
    artistId:    null,  // Jamendo tracks never link to internal artist docs
    albumId:     null,  // Jamendo tracks never link to internal album docs
    trackNumber: null,
    playCount:   0,
    featured:    false,
    uploadedBy:  '',
    createdAt:   null,
    updatedAt:   null,

    // ── Additive Jamendo-specific fields — SongCard ignores unknown keys ────
    source:  'jamendo',
    license: payload.license && typeof payload.license === 'object'
      ? {
          name:                 typeof payload.license.name === 'string' ? payload.license.name : 'Creative Commons',
          ccUrl:                typeof payload.license.ccUrl === 'string' ? payload.license.ccUrl : '',
          attributionRequired:  payload.license.attributionRequired !== false,
          attributionText:      typeof payload.license.attributionText === 'string' ? payload.license.attributionText : '',
        }
      : { name: 'Creative Commons', ccUrl: '', attributionRequired: true, attributionText: '' },
  };
};

/**
 * Normalizes the search response envelope: { songs, total, query, hasMore, nextOffset }.
 * Mirrors extractSongs() from songs.service.js, extended with pagination fields.
 */
export const extractJamendoResults = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[jamendo.service] extractJamendoResults: unexpected payload', payload);
    return { songs: [], total: 0, query: '', hasMore: false, nextOffset: 0 };
  }

  const songs = Array.isArray(payload.songs)
    ? payload.songs.map(extractJamendoTrack).filter(Boolean)
    : [];

  return {
    songs,
    total: typeof payload.total === 'number' ? payload.total : songs.length,
    query: typeof payload.query === 'string' ? payload.query : '',
    hasMore: payload.hasMore === true,
    nextOffset: typeof payload.nextOffset === 'number' ? payload.nextOffset : songs.length,
  };
};

// ─── Internal helper (matches songs.service.js unwrap()) ─────────────────────
const unwrap = (res) => {
  const body = res?.data ?? res;
  return body != null ? body : {};
};

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * searchJamendo({ query, tags, order, limit, offset }) → { songs, total, query, hasMore, nextOffset }
 *
 * Calls GET /api/jamendo/search. Public endpoint — no auth required, but
 * requests still go through the shared `api` instance for consistent
 * timeout/retry/correlation-id behavior.
 *
 * On any error (network, 502 from Jamendo being down, 503 not-configured),
 * resolves to an EMPTY result rather than throwing — the Discover page
 * should show "no results" / a friendly empty state, not crash. Callers
 * that want to distinguish "no results" from "service down" should read
 * the thrown error's `.code` before it's caught here; currently this
 * service intentionally swallows and logs, matching getShuffledSongIds()'s
 * fail-soft precedent in songs.service.js.
 *
 * @param {object} opts
 * @param {string} [opts.query]
 * @param {string} [opts.tags]   comma-separated Jamendo tags, e.g. 'acoustic,piano'
 * @param {string} [opts.order]  Jamendo order value, e.g. 'popularity_total'
 * @param {number} [opts.limit]
 * @param {number} [opts.offset]
 * @returns {Promise<{ songs: object[], total: number, query: string, hasMore: boolean, nextOffset: number }>}
 */
export const searchJamendo = async ({ query = '', tags = '', order = '', limit = 20, offset = 0 } = {}) => {
  try {
    const params = { limit, offset };
    if (query) params.q = query;
    if (tags) params.tags = tags;
    if (order) params.order = order;

    const res = await api.get('/jamendo/search', { params });
    return extractJamendoResults(unwrap(res));
  } catch (err) {
    console.warn('[jamendo.service] searchJamendo failed:', err.message);
    return { songs: [], total: 0, query, hasMore: false, nextOffset: offset };
  }
};

/**
 * getJamendoTrackById(id) → normalized track | null
 *
 * Calls GET /api/jamendo/tracks/:id. Accepts either the raw Jamendo numeric
 * id or the composite 'jamendo:12345' id used throughout the app — the
 * backend strips the prefix itself, but we pass through whatever we have.
 *
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export const getJamendoTrackById = async (id) => {
  if (!id) return null;
  try {
    const res = await api.get(`/jamendo/tracks/${encodeURIComponent(id)}`);
    return extractJamendoTrack(unwrap(res));
  } catch (err) {
    console.warn('[jamendo.service] getJamendoTrackById failed:', id, err.message);
    return null;
  }
};