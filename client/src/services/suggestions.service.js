/**
 * client/src/services/suggestions.service.js
 *
 * API service for playlist suggestions.
 * Follows the same pattern as playlists.service.js and songs.service.js:
 *   - uses the shared `api` axios instance (baseURL = /api, token auto-attached)
 *   - normalizes responses before returning
 *   - never throws raw axios errors — lets api.js interceptor handle them
 */

import api from './api';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalize a raw suggestion document from Firestore into a stable shape.
 * Guards against missing fields so consumers never get undefined crashes.
 */
const normalizeSuggestion = (raw) => ({
  id:           raw?.id           ?? null,
  userId:       raw?.userId       ?? null,
  userEmail:    raw?.userEmail    ?? '',
  link:         raw?.link         ?? '',
  playlistName: raw?.playlistName ?? null,
  status:       raw?.status       ?? 'pending',
  adminMessage: raw?.adminMessage ?? null,
  createdAt:    raw?.createdAt    ?? null,
  updatedAt:    raw?.updatedAt    ?? null,
});

const extractSuggestions = (data) => {
  const arr = data?.suggestions ?? data?.data ?? data;
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeSuggestion);
};

// ── API calls ─────────────────────────────────────────────────────────────────

/**
 * POST /api/suggestions
 * Submit a playlist link suggestion (authenticated user).
 *
 * @param {{ link: string, playlistName?: string }} payload
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export const submitSuggestion = async ({ link, playlistName }) => {
  const { data } = await api.post('/suggestions', {
    link: link.trim(),
    playlistName: playlistName?.trim() || null,
  });
  return data;
};

/**
 * GET /api/suggestions
 * Fetch all suggestions (admin only).
 *
 * @returns {Promise<Array>}
 */
export const fetchSuggestions = async ({ pageParam = null } = {}) => {
  const params = pageParam ? { cursor: pageParam } : {};
  const { data } = await api.get('/suggestions', { params });
  return {
    suggestions: extractSuggestions(data),
    nextCursor:  data?.nextCursor ?? null,
    hasMore:     data?.hasMore    ?? false,
  };
};
/**
 * PATCH /api/suggestions/:id
 * Admin updates status + optional message.
 */
export const updateSuggestion = async ({ id, status, adminMessage }) => {
  const { data } = await api.patch(`/suggestions/${id}`, {
    status,
    adminMessage: adminMessage?.trim() || null,
  });
  return data;
};

/**
 * GET /api/suggestions/mine
 * Fetch current user's own submissions.
 */
export const fetchMySuggestions = async () => {
  const { data } = await api.get('/suggestions/mine');
  const arr = data?.suggestions ?? data?.data ?? data;
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeSuggestion);
};