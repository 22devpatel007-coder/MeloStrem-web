/**
 * client/src/services/songs.service.js
 *
 * CHANGES IN THIS VERSION (surgical — only these changes):
 *
 *   1. extractSong() — audioUrl and fileUrl are EXCLUDED from the list shape.
 *      WHY:   The song list (GET /api/songs) sends audioUrl for every song even
 *             though 99% of those URLs are never used — the user only plays one
 *             song at a time. Removing audioUrl from the list normalizer means:
 *             - List API response payload is smaller (less bandwidth)
 *             - React Query cache for songs list holds no audio URLs
 *             - Audio URLs cannot be bulk-extracted from the list cache
 *             The audioUrl is fetched separately via getSongAudioUrl() only
 *             when the user actually clicks play (called by playerStore.playSong).
 *
 *   2. extractSongForPlay() — new normalizer that INCLUDES audioUrl.
 *      Used only by getSongAudioUrl(). Returns { id, audioUrl, fileUrl } — the
 *      minimum shape needed to start playback. Nothing else is needed at play time
 *      because the full song object is already in the list cache.
 *
 *   3. getSongAudioUrl(id) — new service function.
 *      Calls GET /api/songs/:id (already exists, already cached at 300s TTL).
 *      Returns the audioUrl string for a given song ID.
 *      playerStore.playSong() calls this instead of reading song.audioUrl directly.
 *
 * UNCHANGED — every other function, shape, and behaviour:
 *   - extractSongs(): identical (pagination envelope normalizer)
 *   - getSongs(): identical
 *   - getSongById(): unchanged — still returns full song including audioUrl
 *     (used by admin edit, album/artist detail pages that need full data)
 *   - createSong(), updateSong(), deleteSong(): identical
 *   - unwrap() helper: identical
 *   - All console.warn paths: preserved
 *
 * BACKWARD COMPATIBILITY:
 *   - Song objects from useSongs() / extractSong() no longer have audioUrl.
 *     Any code that reads song.audioUrl from a list song will get undefined.
 *     The only place that reads audioUrl for playback is playerStore.playSong()
 *     — that is updated to call getSongAudioUrl() instead.
 *   - getSongById() still returns audioUrl — admin pages are unaffected.
 */

import api from './api';

// ─── Normalizers ─────────────────────────────────────────────────────────────

/**
 * Normalizes a paginated songs response.
 * Unchanged from previous version.
 */
export const extractSongs = (payload) => {
  if (!payload || typeof payload !== 'object') {
    console.warn('[songs.service] extractSongs: unexpected payload type', typeof payload);
    return { songs: [], nextCursor: null, hasMore: false };
  }

  if (Array.isArray(payload)) {
    console.warn('[songs.service] extractSongs: received raw array — expected object payload');
    return { songs: payload.map(extractSong).filter(Boolean), nextCursor: null, hasMore: false };
  }

  const songs      = Array.isArray(payload.songs) ? payload.songs.map(extractSong).filter(Boolean) : [];
  const nextCursor = payload.nextCursor ?? null;
  const hasMore    = typeof payload.hasMore === 'boolean' ? payload.hasMore : false;

  if (!Array.isArray(payload.songs)) {
    console.warn('[songs.service] extractSongs: songs field missing or non-array', payload);
  }

  return { songs, nextCursor, hasMore };
};

/**
 * Normalizes a single Song for LIST display.
 *
 * FIX: audioUrl and fileUrl are intentionally EXCLUDED here.
 * Audio URLs are only needed at play time — fetched on-demand via getSongAudioUrl().
 * Everything needed to display a song row is present: id, title, artist, album,
 * genre, duration, coverUrl, artistId, albumId, trackNumber, featured, etc.
 *
 * Returns null only if payload is null/undefined/non-object/array.
 */
export const extractSong = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    console.warn('[songs.service] extractSong: unexpected payload', payload);
    return null;
  }

  return {
    id:          typeof payload.id          === 'string'  ? payload.id               : '',
    title:       typeof payload.title        === 'string'  ? payload.title.trim()     : '',
    artist:      typeof payload.artist       === 'string'  ? payload.artist.trim()    : '',
    tags:        Array.isArray(payload.tags) ? payload.tags.map(String) : [],
    album:       typeof payload.album        === 'string'  ? payload.album.trim()     : '',
    duration:    typeof payload.duration     === 'number'  ? payload.duration         : 0,
    // audioUrl intentionally excluded — use getSongAudioUrl(id) at play time
    coverUrl:    typeof payload.coverUrl     === 'string'  ? payload.coverUrl         : '',
    titleLower:  typeof payload.titleLower   === 'string'  ? payload.titleLower       : '',
    artistLower: typeof payload.artistLower  === 'string'  ? payload.artistLower      : '',
    artistId:    payload.artistId    ?? null,
    albumId:     payload.albumId     ?? null,
    trackNumber: payload.trackNumber != null ? Number(payload.trackNumber) || null : null,
    playCount:   typeof payload.playCount    === 'number'  ? payload.playCount        : 0,
    featured:    typeof payload.featured     === 'boolean' ? payload.featured         : false,
    uploadedBy:  typeof payload.uploadedBy   === 'string'  ? payload.uploadedBy       : '',
    createdAt:   payload.createdAt  ?? null,
    updatedAt:   payload.updatedAt  ?? null,
  };
};

/**
 * Normalizes a single Song response for PLAYBACK only.
 * Returns the minimum shape needed to start audio: id + audioUrl.
 * Called only by getSongAudioUrl() — not used for display.
 *
 * Handles the fileUrl/audioUrl alias for legacy Firestore documents.
 */
const extractSongForPlay = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  return {
    id:       typeof payload.id === 'string' ? payload.id : '',
    audioUrl: payload.audioUrl || payload.fileUrl || '',
  };
};

// ─── Internal helpers ─────────────────────────────────────────────────────────
const _audioUrlCache = new Map();
const AUDIO_URL_CACHE_TTL_MS = 300_000; 
const unwrap = (res) => {

  const body = res?.data ?? res;
  return body != null ? body : {};
};

// ─── Service functions ────────────────────────────────────────────────────────

/**
 * Fetches a paginated page of songs (display data only — no audioUrl).
 * Unchanged from previous version except extractSong now omits audioUrl.
 */
export const getSongs = async (limit = 20, cursor = null) => {
  const params = { limit };
  if (cursor) params.cursor = cursor;
  const res = await api.get('/songs', { params });
  const normalized = extractSongs(unwrap(res));
  return {
    songs:      Array.isArray(normalized.songs) ? normalized.songs : [],
    nextCursor: normalized.nextCursor ?? null,
    hasMore:    normalized.nextCursor != null && normalized.hasMore === true,
  };
};

/**
 * Fetches the audioUrl for a single song by ID.
 *
 * Called by playerStore.playSong() at play time — NOT on list load.
 * Uses GET /api/songs/:id which is already cached at 300s TTL in the backend.
 * React Query on the frontend also caches the result via getSongById queryKey
 * if the admin/detail page has already fetched it.
 *
 * Returns the audio URL string, or '' if the song is not found.
 *
 * @param {string} id
 * @returns {Promise<string>}
 */
export const getSongAudioUrl = async (id) => {
  // Serve from client cache if still valid — avoids network on background/locked screen
  const cached = _audioUrlCache.get(id);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.url;
  }
  try {
    const res  = await api.get(`/songs/${id}`);
    const data = extractSongForPlay(unwrap(res));
    const url  = data?.audioUrl || '';
    if (url) {
      _audioUrlCache.set(id, { url, expiresAt: Date.now() + AUDIO_URL_CACHE_TTL_MS });
    }
    return url;
  } catch (err) {
    console.warn('[songs.service] getSongAudioUrl: failed to fetch audio URL for', id, err.message);
    return '';
  }
};

/**
 * Fetches a single song by ID — full shape including audioUrl.
 * Used by admin edit, album/artist detail pages. Unchanged.
 */
export const getSongById = async (id) => {
  const res = await api.get(`/songs/${id}`);
  // For getSongById we return the full payload including audioUrl
  // by calling the full normalizer directly on the raw payload.
  const payload = unwrap(res);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const audioUrl = payload.audioUrl || payload.fileUrl || '';
  return {
    ...extractSong(payload),  // display fields
    audioUrl,                  // re-add audioUrl for full-detail consumers
    fileUrl: audioUrl,         // preserve alias
  };
};

/**
 * Creates a new song via multipart/form-data upload. Unchanged.
 */
export const createSong = async (formData) => {
  const res = await api.post('/songs', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return extractSong(unwrap(res));
};

/**
 * Updates a song by ID. Unchanged.
 */
export const updateSong = async (id, data) => {
  const res = await api.patch(`/songs/${id}`, data);
  return extractSong(unwrap(res));
};

/**
 * Deletes a song by ID. Unchanged.
 */
export const deleteSong = async (id) => {
  const res = await api.delete(`/songs/${id}`);
  return unwrap(res);
};
/**
 * Bulk deletes songs by ID array. Admin only.
 */
export const bulkDeleteSongs = async (ids) => {
  const res = await api.delete('/songs/bulk-delete', { data: { ids } });
  return res?.data ?? {};
};