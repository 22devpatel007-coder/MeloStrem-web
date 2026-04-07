import axios from 'axios';
import { auth } from '../firebase';
import { API_BASE_URL } from '../config/index';

const api = axios.create({ baseURL: `${API_BASE_URL}/api`, withCredentials: true });

// ── Request interceptor — attach Firebase token ───────────────────────────────
api.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

let isRefreshing = false;

// ── Shared error handler ──────────────────────────────────────────────────────
// BUG 1 FIX: Previously did Promise.reject({ message, code, status }) —
// a plain object. React Query stores this as `error`, and any component
// that renders {error} directly crashes with:
// "Objects are not valid as a React child"
//
// Fix: always reject with a real Error instance.
// Attach code + status as properties so callers can still read them.
// Now error.message always works — no more React crash.
const handleResponseError = async (error) => {
  // ✅ Build a real Error — not a plain object
  const message =
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.message ||
    'Something went wrong. Please try again.';

  const code =
    error.response?.data?.error?.code ||
    error.response?.data?.code ||
    'UNKNOWN';

  const status = error.response?.status ?? null;

  // Token expired — try a silent refresh once
  if (status === 401 && !isRefreshing) {
    isRefreshing = true;
    try {
      const user = auth.currentUser;
      if (user) await user.getIdToken(true); // force refresh
    } catch {
      // Refresh failed — redirect to login
      window.location.href = '/login';
    } finally {
      isRefreshing = false;
    }
  }

  // ✅ Always reject with a real Error instance
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return Promise.reject(err);
};

api.interceptors.response.use((response) => response, handleResponseError);

// ── Upload instance (longer timeout for file uploads) ─────────────────────────
export const axiosUpload = axios.create({
  baseURL: `${API_BASE_URL}/api`, // ✅ FIX: was API_BASE_URL — missing /api prefix
  withCredentials: true,
  timeout: 300_000,
});

axiosUpload.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;
    if (user) {
      const token = await user.getIdToken();
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ✅ FIX: Share the named handler — not api.interceptors.response.handlers[0].rejected
// which is an undocumented Axios internal that can be undefined in newer versions.
axiosUpload.interceptors.response.use((response) => response, handleResponseError);

// ── Normalisation helpers ─────────────────────────────────────────────────────
export const extractSongs = (data) =>
  Array.isArray(data) ? data : data?.songs ?? data?.data?.songs ?? [];

export const extractUsers = (data) =>
  Array.isArray(data) ? data : data?.users ?? data?.data?.users ?? data?.data ?? [];

export default api;