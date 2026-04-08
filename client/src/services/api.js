// ─── client/src/services/api.js ───────────────────────────────────────────────
import axios from 'axios';
import { auth } from '../firebase';
import { API_BASE_URL } from '../config/index';

// API_BASE_URL = "https://your-backend.onrender.com"  (no /api suffix)
// baseURL here adds /api — so final requests go to /api/songs, /api/search etc.
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 15_000, // 15s — Render free tier can be slow on cold start
});

// ── Request interceptor — attach Firebase token ───────────────────────────────
api.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } catch (tokenError) {
        // Token fetch failed — continue without auth header
        // The backend will return 401 and the response interceptor will handle it
        console.warn('[api] Failed to get ID token:', tokenError.message);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;

// ── Shared error handler ──────────────────────────────────────────────────────
const handleResponseError = async (error) => {
  // Network error (no response) — backend down, CORS blocked, or no internet
  if (!error.response) {
    const err = new Error(
      'Network Error. Please check your connection or try again later.'
    );
    err.code = 'NETWORK_ERROR';
    err.status = null;
    err.isNetworkError = true;
    return Promise.reject(err);
  }

  const status = error.response.status;

  const message =
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.message ||
    'Something went wrong. Please try again.';

  const code =
    error.response?.data?.error?.code ||
    error.response?.data?.code ||
    'UNKNOWN';

  // Token expired — try a silent refresh once
  if (status === 401 && !isRefreshing) {
    isRefreshing = true;
    try {
      const user = auth.currentUser;
      if (user) {
        await user.getIdToken(true); // force refresh
      } else {
        // No user in Firebase — session is gone, redirect to login
        window.location.href = '/login';
        return Promise.reject(new Error('Session expired. Please log in again.'));
      }
    } catch {
      window.location.href = '/login';
    } finally {
      isRefreshing = false;
    }
  }

  // Always reject with a real Error instance (not a plain object).
  // Plain objects crash React when rendered: "Objects are not valid as a React child"
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return Promise.reject(err);
};

api.interceptors.response.use((response) => response, handleResponseError);

// ── Upload instance (longer timeout for file uploads) ─────────────────────────
export const axiosUpload = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 300_000, // 5 min for large file uploads
});

axiosUpload.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } catch (tokenError) {
        console.warn('[axiosUpload] Failed to get ID token:', tokenError.message);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

axiosUpload.interceptors.response.use((response) => response, handleResponseError);

// ── Normalisation helpers ─────────────────────────────────────────────────────
export const extractSongs = (data) =>
  Array.isArray(data) ? data : data?.songs ?? data?.data?.songs ?? [];

export const extractSong = (data) =>
  data?.song ?? data?.data?.song ?? data?.data ?? null;

export const extractUsers = (data) =>
  Array.isArray(data) ? data : data?.users ?? data?.data?.users ?? data?.data ?? [];

export default api;