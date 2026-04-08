// ─── client/src/config/index.js ───────────────────────────────────────────────
//
// IMPORTANT: REACT_APP_API_URL must NOT end with /api.
// The /api prefix is appended by the Axios instance in api.js.
//
// Set in client/.env:
//   REACT_APP_API_URL=https://your-backend.onrender.com
//
// Set in Vercel dashboard → Project → Settings → Environment Variables:
//   REACT_APP_API_URL=https://your-backend.onrender.com

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