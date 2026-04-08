// ─── client/src/config/index.js ───────────────────────────────────────────────
//
// IMPORTANT: API_BASE_URL must NOT end with /api.
// The /api prefix is appended by the Axios instance in api.js.
// Previously this exported "http://localhost:5000/api" which caused
// requests to go to /api/api/songs — a 404/CORS dead-end.

export const API_BASE_URL =
  process.env.REACT_APP_API_URL || 'http://localhost:5000';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export const FIREBASE_CONFIG = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};