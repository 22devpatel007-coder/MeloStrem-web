// ─── client/src/services/api.js ───────────────────────────────────────────────
import axios from 'axios';
import { auth } from '../firebase';
import { API_BASE_URL, IS_PRODUCTION } from '../config/index';

// ── Axios instance ────────────────────────────────────────────────────────────
// API_BASE_URL = "https://your-backend.onrender.com"  (no /api suffix)
// baseURL here adds /api — so final requests hit /api/songs, /api/search etc.
const api = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  // Render free tier cold-start can take 30-50 seconds on first wake.
  // 30s timeout gives it room to wake up; after that we retry (see below).
  timeout: 30_000,
});

// ── Keep-alive ping ───────────────────────────────────────────────────────────
// Pings /health every 10 minutes so Render never goes cold during active use.
// Only runs in production and only when a user is signed in (no wasted pings).
//
// Complement this with a FREE external uptime monitor:
//   → UptimeRobot: https://uptimerobot.com  (pings every 5 min, free tier)
//   → BetterStack: https://betterstack.com  (free tier available)
// Configure it to ping: https://your-backend.onrender.com/health
// That keeps the server warm even when no users are online.
let _keepAliveInterval = null;

export const startKeepAlive = () => {
  if (!IS_PRODUCTION || _keepAliveInterval) return;
  _keepAliveInterval = setInterval(async () => {
    try {
      await axios.get(`${API_BASE_URL}/health`, { timeout: 10_000 });
    } catch {
      // Silent — this is a best-effort ping, not user-facing
    }
  }, 10 * 60 * 1000); // every 10 minutes
};

export const stopKeepAlive = () => {
  if (_keepAliveInterval) {
    clearInterval(_keepAliveInterval);
    _keepAliveInterval = null;
  }
};

// ── Retry helper ──────────────────────────────────────────────────────────────
// Retries a failed request up to `maxRetries` times with exponential backoff.
// Only retries on network errors or 5xx responses (server-side transient errors).
// Never retries on 4xx (client errors — retrying won't fix them).
const retryRequest = async (error, maxRetries = 2) => {
  const config = error.config;

  // Don't retry if:
  // - No config available (malformed call)
  // - We've already hit the retry limit
  // - It's a 4xx client error (auth, validation, not found)
  const status = error.response?.status;
  const isClientError = status && status >= 400 && status < 500;
  if (!config || isClientError) return Promise.reject(error);

  config._retryCount = (config._retryCount || 0) + 1;
  if (config._retryCount > maxRetries) return Promise.reject(error);

  // Exponential backoff: 1s, 2s, 4s …
  const delay = Math.min(1000 * 2 ** (config._retryCount - 1), 8000);
  await new Promise((resolve) => setTimeout(resolve, delay));

  // Re-attach a fresh token on retry in case the original expired
  try {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  } catch {
    // Continue without token — backend will return 401 if required
  }

  return api(config);
};

// ── Request interceptor — attach Firebase token ───────────────────────────────
api.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      try {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } catch (tokenError) {
        // Token fetch failed — continue without auth header.
        // Backend returns 401 → response interceptor handles redirect.
        console.warn('[api] Failed to get ID token:', tokenError.message);
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;

// ── Response interceptor — error normalisation + retry ────────────────────────
const handleResponseError = async (error) => {
  // ── Network / CORS / server-down error ────────────────────────────────────
  // error.response is undefined when:
  //   a) Backend is down (521, connection refused)
  //   b) CORS blocks the response
  //   c) Request timed out
  //   d) No internet
  //
  // For (a) and (c): retry — the server may just be cold-starting.
  // For (b): retrying won't help, but we can't distinguish CORS from network
  //          failure on the client side, so we retry anyway (harmless).
  if (!error.response) {
    // Attempt retry before surfacing a user-facing error
    try {
      return await retryRequest(error);
    } catch (retryError) {
      // All retries exhausted — surface a clear, actionable error
      const err = new Error(
        'Unable to reach the server. Please check your connection and try again.'
      );
      err.code = 'NETWORK_ERROR';
      err.status = null;
      err.isNetworkError = true;
      return Promise.reject(err);
    }
  }

  const status = error.response.status;

  // ── 5xx server errors — retry (transient) ─────────────────────────────────
  if (status >= 500) {
    try {
      return await retryRequest(error);
    } catch {
      // Fall through to standard error creation below
    }
  }

  const message =
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.message ||
    'Something went wrong. Please try again.';

  const code =
    error.response?.data?.error?.code ||
    error.response?.data?.code ||
    'UNKNOWN';

  // ── 401 — try a silent token refresh once ─────────────────────────────────
  if (status === 401 && !isRefreshing) {
    isRefreshing = true;
    try {
      const user = auth.currentUser;
      if (user) {
        await user.getIdToken(true); // force refresh
        isRefreshing = false;
        // Retry the original request once with the fresh token
        return api(error.config);
      } else {
        // No Firebase user — session is gone entirely
        isRefreshing = false;
        window.location.href = '/login';
        return Promise.reject(new Error('Session expired. Please log in again.'));
      }
    } catch {
      isRefreshing = false;
      window.location.href = '/login';
      return Promise.reject(new Error('Session expired. Please log in again.'));
    }
  }

  // Reject with a real Error instance — NEVER a plain object.
  // Plain objects crash React when rendered: "Objects are not valid as a React child"
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return Promise.reject(err);
};

api.interceptors.response.use((response) => response, handleResponseError);

// ── Upload instance (longer timeout for large file uploads) ───────────────────
export const axiosUpload = axios.create({
  baseURL: `${API_BASE_URL}/api`,
  withCredentials: true,
  timeout: 300_000, // 5 min — Cloudinary uploads can be large
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
// Always use these instead of accessing .songs / .data directly.
// Backend response envelopes are not yet fully uniform (see CLAUDE.md §12),
// so these helpers absorb the variance and return stable shapes.
export const extractSongs = (data) =>
  Array.isArray(data) ? data : data?.songs ?? data?.data?.songs ?? [];

export const extractSong = (data) =>
  data?.song ?? data?.data?.song ?? data?.data ?? null;

export const extractUsers = (data) =>
  Array.isArray(data) ? data : data?.users ?? data?.data?.users ?? data?.data ?? [];

export default api;