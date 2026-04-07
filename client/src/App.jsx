/**
 * client/src/App.jsx
 *
 * FIX: getIdTokenResult(true) forces a fresh token from Firebase on every
 * auth state change. Without `true`, Firebase returns a cached token that
 * may not contain the latest custom claims (e.g. admin: true).
 *
 * This is the permanent fix for admin pages redirecting to home after
 * setAdminClaim.js has been run — the cached token was missing the claim.
 */

import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import useAuthStore, { registerQueryClient } from './store/authStore';
import AppRoutes from './routes/index';
import MusicPlayer from './components/player/MusicPlayer';

// ─── React Query client ───────────────────────────────────────────────────────
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60_000,
    },
  },
});

registerQueryClient(queryClient);

// ─── App component ────────────────────────────────────────────────────────────

const App = () => {
  const { setUser, setAdmin, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // ✅ FIX: pass `true` to force a fresh token from Firebase.
        // Without this, Firebase returns a cached token that may not
        // contain custom claims set after the last sign-in (e.g. admin: true).
        const tokenResult = await firebaseUser.getIdTokenResult(true);
        setUser(firebaseUser);
        setAdmin(!!tokenResult.claims.admin);
      } else {
        setUser(null);
        setAdmin(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [setUser, setAdmin, setLoading]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        {/*
          MusicPlayer lives HERE — at the app shell level.
          - Inside QueryClientProvider and BrowserRouter so it can use hooks.
          - Outside AppRoutes so it is never unmounted when routes change.
          - Returns null internally when no song is playing, so no layout cost.
        */}
        <MusicPlayer />
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;