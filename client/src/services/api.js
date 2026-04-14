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

  // Exponential backoff: 1s, 2s, 4s ...
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

// ── Token refresh state (Task 1.4) ────────────────────────────────────────────
// isRefreshing — true while a getIdToken(true) call is in-flight.
//   Prevents N simultaneous 401s from each spawning their own refresh call.
//
// _refreshQueue — requests that arrived while a refresh was already running.
//   Each entry is { resolve, reject }. When the refresh settles, every queued
//   request is either retried (resolve) or rejected (reject) in one pass.
//
// _refreshRetryCount — guards against infinite 401 loops.
//   If the server keeps returning 401 even after a successful token refresh
//   (e.g. the account was deleted server-side), we stop after 1 retry cycle
//   and redirect to /login instead of hammering the backend indefinitely.
let isRefreshing = false;
let _refreshQueue = [];
let _refreshRetryCount = 0;
const MAX_REFRESH_RETRIES = 1;

/**
 * Drain the pending queue after a token refresh attempt.
 * @param {string|null} newToken  Fresh token on success, null on failure.
 * @param {Error|null}  err       Error to reject with on failure.
 */
const _drainRefreshQueue = (newToken, err) => {
  _refreshQueue.forEach(({ resolve, reject }) => {
    if (err) {
      reject(err);
    } else {
      resolve(newToken);
    }
  });
  _refreshQueue = [];
};

/**
 * Redirect to /login and reject with a session-expired error.
 * Resets all refresh state so the next login attempt starts clean.
 */
const _forceLogout = (reason = 'Session expired. Please log in again.') => {
  isRefreshing = false;
  _refreshRetryCount = 0;
  _drainRefreshQueue(null, new Error(reason));
  window.location.href = '/login';
  return Promise.reject(new Error(reason));
};

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

  // ── 401 — Token Refresh with Request Queue (Task 1.4) ─────────────────────
  //
  // Problem this solves:
  //   Firebase ID tokens expire after 1 hour. If 5 requests all get 401
  //   simultaneously, the old code would fire 5 independent getIdToken(true)
  //   calls and then retry all 5 — causing a request storm and race conditions.
  //
  // How this works:
  //   1. First 401 sets isRefreshing = true and starts ONE refresh call.
  //   2. Any subsequent 401s while refresh is in-flight are added to
  //      _refreshQueue as pending { resolve, reject } callbacks — they wait.
  //   3. When the refresh resolves:
  //      - Success → _drainRefreshQueue(newToken) retries all queued requests
  //        with the fresh token attached.
  //      - Failure → _drainRefreshQueue(null, err) rejects all queued requests,
  //        then _forceLogout() redirects to /login.
  //   4. _refreshRetryCount prevents an infinite loop: if the server keeps
  //      returning 401 even after a valid fresh token, we give up after
  //      MAX_REFRESH_RETRIES (1) attempt and force logout.
  //   5. _skipRefresh flag on the original config prevents the refresh-retry
  //      itself from re-entering this block on its own 401.
  if (status === 401) {
    const originalConfig = error.config;

    // Guard: if this request was already a post-refresh retry, do not loop.
    if (originalConfig._skipRefresh || _refreshRetryCount >= MAX_REFRESH_RETRIES) {
      return _forceLogout();
    }

    if (isRefreshing) {
      // Another refresh is already running — queue this request.
      // Returns a Promise that resolves/rejects when the refresh settles.
      return new Promise((resolve, reject) => {
        _refreshQueue.push({
          resolve: (newToken) => {
            originalConfig.headers = originalConfig.headers || {};
            originalConfig.headers.Authorization = `Bearer ${newToken}`;
            originalConfig._skipRefresh = true;
            resolve(api(originalConfig));
          },
          reject,
        });
      });
    }

    // We are the first 401 — start the refresh cycle.
    isRefreshing = true;
    _refreshRetryCount += 1;

    try {
      const user = auth.currentUser;

      if (!user) {
        // No Firebase user at all — session is completely gone.
        return _forceLogout();
      }

      // Force-refresh the ID token (bypasses Firebase's local cache).
      const newToken = await user.getIdToken(true);

      // Refresh succeeded — reset state.
      isRefreshing = false;
      _refreshRetryCount = 0;

      // Drain the queue: retry all waiting requests with the new token.
      _drainRefreshQueue(newToken, null);

      // Retry the original request that triggered the 401.
      originalConfig.headers = originalConfig.headers || {};
      originalConfig.headers.Authorization = `Bearer ${newToken}`;
      originalConfig._skipRefresh = true; // prevent re-entry on this config
      return api(originalConfig);

    } catch (refreshError) {
      // getIdToken(true) itself failed — token is revoked or user deleted.
      return _forceLogout();
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