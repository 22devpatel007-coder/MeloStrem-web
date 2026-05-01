/**
 * client/src/App.jsx
 *
 * BUG-012 FIX — staleTime:0 setQueryDefaults for admin-critical keys.
 *
 * WHAT CHANGED vs previous version:
 *   1. Imported QUERY_KEYS from constants/queryKeys.
 *   2. After registerQueryClient, added queryClient.setQueryDefaults for
 *      SONGS, PLAYLISTS, ADMIN_PLAYLISTS, USER_PLAYLISTS — all set to
 *      staleTime:0. This means any hook reading these keys will ALWAYS
 *      treat cached data as stale and refetch after a mutation invalidation.
 *      The global 2min default still applies to non-admin keys (artist,
 *      album, search) which are read-only and safe to cache longer.
 *
 * WHAT DID NOT CHANGE:
 *   - QueryClient global defaults (staleTime 2min, retry, backoff) — identical
 *   - registerQueryClient call — identical
 *   - onAuthStateChanged auth flow — identical
 *   - QueryClientProvider, BrowserRouter, ToastProvider positions — identical
 *   - Error boundary placement — identical
 *   - overflow:clip on shell divs — identical
 *   - MusicPlayer mounting outside AppRoutes — identical
 */

import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect ,useRef  } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { sendHeartbeat, sendOffline } from './services/users.service';
import useAuthStore, { registerQueryClient } from './store/authStore';
import AppRoutes from './routes/index';
import MusicPlayer from './components/player/MusicPlayer';
import { ToastProvider } from './components/ui/Toast';
import { QUERY_KEYS } from './constants/queryKeys';
import {
  AppErrorBoundary,
  PlayerErrorBoundary,
} from './components/errors/ErrorBoundary';
import NetworkErrorBanner from './components/errors/NetworkErrorBanner';
import InstallPrompt from './components/pwa/InstallPrompt';
import UpdatePrompt  from './components/pwa/UpdatePrompt';
// ─── React Query client ───────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Global default: 2 minutes for read-heavy, non-admin routes
      // (artist detail, album detail, search results, public playlists).
      // Admin-critical keys (songs, playlists) override this to 0 below
      // via setQueryDefaults so mutations always produce fresh reads.
      staleTime: 2 * 60_000, // 2 minutes global default

      // Disable window-focus refetch globally — primary trigger of 429 storms.
      // Hooks that genuinely need focus refetch can opt in individually.
      refetchOnWindowFocus: false,

      // Exponential backoff on retry.
      // Never retry 4xx (except 429 — rate limited, transient, worth retrying).
      retry: (failureCount, error) => {
        const status = error?.response?.status;
        if (status && status >= 400 && status < 500 && status !== 429) {
          return false; // 401, 403, 404 — not transient, don't retry
        }
        return failureCount < 2; // max 2 retries for network errors and 429
      },

      retryDelay: (attemptIndex) =>
        Math.min(1000 * 2 ** attemptIndex, 10_000), // 1s, 2s, capped at 10s

      // Keep previous data while refetching — no loading flash on background updates
      placeholderData: (previousData) => previousData,
    },
  },
});

registerQueryClient(queryClient);

queryClient.setQueryDefaults(QUERY_KEYS.SONGS,            { staleTime: 0 });
queryClient.setQueryDefaults(QUERY_KEYS.PLAYLISTS,        { staleTime: 0 });
queryClient.setQueryDefaults(QUERY_KEYS.ADMIN_PLAYLISTS,  { staleTime: 0 });
queryClient.setQueryDefaults(QUERY_KEYS.USER_PLAYLISTS,   { staleTime: 0 });
window.__reactQueryClient = queryClient;

const App = () => {
  const { setUser, setAdmin, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
        setUser(firebaseUser);
        setAdmin(!!tokenResult.claims.admin);
        sendHeartbeat(firebaseUser.uid).catch(() => {});
      } else {
        setUser(null);
        setAdmin(false);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [setUser, setAdmin, setLoading]);
  const heartbeatRef = useRef(null);

  useEffect(() => {
    const { user } = useAuthStore.getState();
    if (!user) return;

    // Ping every 5 minutes while tab is open
    heartbeatRef.current = setInterval(() => {
      sendHeartbeat(user.uid).catch(() => {});
    }, 5 * 60_000);

    // Mark offline when tab closes
    const handleUnload = () => sendOffline(user.uid);
    window.addEventListener('beforeunload', handleUnload);

    return () => {
      clearInterval(heartbeatRef.current);
      window.removeEventListener('beforeunload', handleUnload);
      sendOffline(user.uid).catch(() => {});
    };
  }, []);
  return (
    // AppErrorBoundary — outermost safety net.
    // Placed outside QueryClientProvider and BrowserRouter so it can catch
    // catastrophic failures in those providers themselves.
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <NetworkErrorBanner />
          <ToastProvider>
            {/*
              overflow:clip suppresses layout overflow (same as hidden)
              but does NOT create a containing block for position:fixed.
              This means all fixed children (sheets, drawers, modals,
              MiniPlayerBar) correctly anchor to the viewport.
            */}
            <div className="h-screen flex flex-col bg-[#0f0f0f]" style={{ overflow: 'clip' }}>
              <div className="flex flex-1 min-h-0" style={{ overflow: 'clip' }}>
                <AppRoutes />
              </div>
            </div>

            {/*
              MusicPlayer outside layout — route transitions never unmount it.
              MiniPlayerBar inside uses position:fixed — anchors to viewport
              correctly since no ancestor has overflow:hidden above it.

              PlayerErrorBoundary wraps only MusicPlayer. If the player crashes
              (malformed song data, audio API failure, bad cover URL), only the
              player bar shows an error state. Page content and navigation remain
              fully functional.
            */}
            <PlayerErrorBoundary>
              <MusicPlayer />
            </PlayerErrorBoundary>
            <InstallPrompt />
            <UpdatePrompt />
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
};

export default App;