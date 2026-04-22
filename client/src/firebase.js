/**
 * client/src/firebase.js
 *
 * FINAL FIX — persistentSingleTabManager() with NO options.
 *
 * Full explanation in comments below.
 */

import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey:            process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain:        process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId:         process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket:     process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId:             process.env.REACT_APP_FIREBASE_APP_ID,
};

const app = initializeApp(firebaseConfig);

// ─── WHY persistentSingleTabManager() ────────────────────────────────────────
//
// With the scalable fix in place (useUserPlaylists + useAdminPlaylists now use
// REST + React Query), the only remaining Firestore client usage is:
//   - usePlaylistMutations (one-shot writes — addDoc, updateDoc, deleteDoc)
//   - Auth token reads via Firebase Auth SDK
//
// persistentSingleTabManager() is correct for this usage pattern:
//   ✅ Each tab manages its own IndexedDB cache independently
//   ✅ No cross-tab lock contention
//   ✅ No WatchChangeAggregator race condition
//   ✅ No assertion errors on 2, 3, or N tabs
//   ✅ Write operations work correctly (they don't use the tab manager)
//
// NOTE on { forceOwnership: true } — do NOT add this option.
//   forceOwnership causes Tab 2 to steal the IndexedDB lock from Tab 1,
//   corrupting Tab 1's local cache. Both tabs then error. Omit it entirely.
//
// TRADE-OFF:
//   Multiple tabs do not share a single IndexedDB cache entry. With the
//   scalable REST fix in place, this is no longer relevant — playlist data
//   comes from the REST API (React Query cache, in-memory per tab), not
//   from Firestore's IndexedDB cache. Each tab works correctly and independently.
// ─────────────────────────────────────────────────────────────────────────────
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(),
  }),
});

export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({ prompt: 'select_account' });

export default app;