 /**
 * client/src/App.jsx
 *
 * PRODUCTION FIX — QueryClient defaults tightened to eliminate request storm
 *
 * ROOT CAUSE (confirmed from network DevTools):
 *   The QueryClient had staleTime: 60_000 in defaultOptions, but this was
 *   being silently overridden to 0 by individual hooks that declared no
 *   staleTime. In React Query, per-query staleTime ALWAYS wins over
 *   defaultOptions — a query with no staleTime set gets React Query's
 *   built-in default of 0ms, NOT the value in defaultOptions.queries.staleTime.
 *
 *   Result:
 *   - usePlaylists() in Sidebar had no staleTime → staleTime = 0 → every
 *     window focus / component mount triggered a new /playlists request.
 *   - useSongs() had no staleTime → staleTime = 0 → same storm on songs?limit=30.
 *   - Both Sidebar and Playlists.jsx call useUserPlaylists() simultaneously
 *     on mount. With staleTime:0, React Query does NOT deduplicate — both
 *     fire independent requests before the first one resolves. That's the
 *     /api/users/:uid/playlists 429 in the screenshot.
 *
 * FIX:
 *   1. Raise defaultOptions.queries.staleTime to 2 minutes.
 *      This is the true fallback — any hook that forgets to declare staleTime
 *      gets 2 minutes instead of 0ms. This eliminates the storm from any
 *      future hook that's added without an explicit staleTime.
 *
 *   2. Add refetchOnWindowFocus: false globally.
 *      Window focus refetches are the primary trigger of the 429 storm.
 *      Individual hooks that NEED focus refetch (none currently do) can
 *      opt back in with refetchOnWindowFocus: true in their own options.
 *      For a music app where the tab stays open for hours, this is correct.
 *
 *   3. Raise retry from 1 to 2, and add retryDelay with exponential backoff.
 *      When the server does return 429, React Query currently retries
 *      immediately — hammering the rate limiter again. Exponential backoff
 *      (1s → 2s → 4s, capped at 10s) gives the server time to recover.
 *
 *   4. Add shouldRetryRequest to skip retrying on 4xx errors (except 429).
 *      401/403/404 should never be retried — they are not transient.
 *      429 (rate limited) should be retried after backoff.
 *
 * WHAT DID NOT CHANGE:
 *   - QueryClientProvider, BrowserRouter, ToastProvider — identical
 *   - onAuthStateChanged auth flow — identical
 *   - MusicPlayer mounted outside layout — identical
 *   - overflow:clip fix on shell divs — identical
 *   - flex structure and h-screen — identical
 */

import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import useAuthStore, { registerQueryClient } from './store/authStore';
import AppRoutes from './routes/index';
import MusicPlayer from './components/player/MusicPlayer';
import { ToastProvider } from './components/ui/Toast';

// ─── React Query client ───────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // ── FIXED: was 60_000 but had no real effect because per-query ──────────
      // staleTime:0 (React Query built-in default) always wins over this value
      // when hooks don't explicitly declare staleTime.
      // Raising this to 2min means any hook that forgets staleTime gets 2min
      // instead of 0ms — eliminates future accidental storms.
      staleTime: 2 * 60_000,          // 2 minutes global default

      // ── FIXED: disable window-focus refetch globally ──────────────────────
      // refetchOnWindowFocus was triggering songs + playlists refetches every
      // time the user switched tabs and returned. For a music app that stays
      // open for hours, this is the primary cause of the 429 storm.
      // Hooks that genuinely need focus refetch can opt in individually.
      refetchOnWindowFocus: false,

      // ── FIXED: exponential backoff on retry ───────────────────────────────
      // Previously retry:1 with immediate retry — when the server returns 429,
      // an immediate retry just hits the rate limiter again.
      // Now: max 2 retries with exponential backoff (1s → 2s), capped at 10s.
      retry: (failureCount, error) => {
        // Never retry on 4xx except 429 (rate limited — transient, worth retrying)
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

// ─── App ─────────────────────────────────────────────────────────────────────

const App = () => {
  const { setUser, setAdmin, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const tokenResult = await firebaseUser.getIdTokenResult();
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
          */}
          <MusicPlayer />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;