/**
 * client/src/services/users.service.js
 *
 * BUG-002 fix: replaced raw .data.data chains with defensive normalizers.
 *
 * Root cause: every function called .data.data directly with no null guard.
 * If the backend returned { success, data } and data was missing/null,
 * the caller received undefined and any .map() call crashed the UI.
 *
 * Fix: extractArray() and extractObject() handle all envelope shapes
 * defensively — same pattern already used in playlists.service.js.
 */

import api from './api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Handles: { data: { data: [...] } }  →  Axios wraps { success, data: [...] }
//          { data: [...] }            →  Axios wraps raw array
//          anything else              →  []
const extractArray = (res) => {
  if (Array.isArray(res?.data?.data)) return res.data.data;
  if (Array.isArray(res?.data))       return res.data;
  return [];
};

// Handles: { data: { data: {...} } }  →  Axios wraps { success, data: {...} }
//          { data: {...} }            →  Axios wraps raw object
//          anything else              →  null
const extractObject = (res) => {
  if (res?.data?.data && typeof res.data.data === 'object') return res.data.data;
  if (res?.data       && typeof res.data       === 'object') return res.data;
  return null;
};

// ─── Service functions ────────────────────────────────────────────────────────

export const getUsers = async () => {
  const res = await api.get('/users');
  return extractArray(res);
};

export const getUserById = async (uid) => {
  const res = await api.get(`/users/${uid}`);
  return extractObject(res);
};

export const updateUserRole = async (uid, role) => {
  const res = await api.put(`/users/${uid}/role`, { role });
  return extractObject(res);
};

export const getLikedSongs = async (uid) => {
  const res = await api.get(`/users/${uid}/liked-songs`);
  // Backend returns { success: true, data: Song[] }
  return extractArray(res);
};

export const toggleLikeSong = async (uid, songId) => {
  const res = await api.post(`/users/${uid}/liked-songs/${songId}`);
  // Backend returns { success: true, data: string[] } — the updated liked ID list
  return extractArray(res);
};

export const sendHeartbeat  = (uid) => api.post(`/users/${uid}/heartbeat`);
export const getRecentPlays = async (uid, limit = 20) => {
  const res = await api.get(`/users/${uid}/recent-plays`, { params: { limit } });
  return extractArray(res);
};

export const getUserPlaylists = async (uid) => {
  const res = await api.get(`/users/${uid}/playlists`);
  return extractArray(res);
};
export const sendOffline    = (uid) => api.post(`/users/${uid}/offline`);
export const updateListenSession = (uid, action, durationSeconds) =>
  api.patch(`/users/${uid}/listen-session`, { action, durationSeconds });

export const getSessionData = async (uid) => {
  const res = await api.get(`/users/${uid}/session`);
  return extractObject(res);
};