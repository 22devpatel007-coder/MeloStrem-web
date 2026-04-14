/**
 * client/src/App.jsx
 *
 * PHASE 1 — TASK 1.3 ADDITION: Three-level error boundary strategy.
 *
 * WHAT CHANGED vs previous version:
 *   1. Imported AppErrorBoundary and PlayerErrorBoundary from
 *      components/errors/ErrorBoundary.jsx
 *   2. AppErrorBoundary wraps the entire JSX return — catches catastrophic
 *      failures that escape both inner boundaries. Last resort.
 *   3. PlayerErrorBoundary wraps <MusicPlayer /> — if the player crashes
 *      (malformed song data, audio API failure), only the player bar shows
 *      an error state. Navigation and page content are unaffected.
 *
 * WHAT DID NOT CHANGE:
 *   - QueryClient config (staleTime, refetchOnWindowFocus, retry, backoff) — identical
 *   - registerQueryClient call — identical
 *   - onAuthStateChanged auth flow — identical
 *   - QueryClientProvider, BrowserRouter, ToastProvider positions — identical
 *   - overflow:clip on shell divs — identical
 *   - flex structure and h-screen — identical
 *   - AppRoutes position — identical
 *   - MusicPlayer mounting outside AppRoutes — identical
 *
 * BOUNDARY PLACEMENT RATIONALE:
 *   AppErrorBoundary is the outermost wrapper — it must be outside
 *   QueryClientProvider and BrowserRouter so it can catch errors in those
 *   providers themselves (rare, but possible).
 *
 *   PlayerErrorBoundary is inside ToastProvider so the fallback ErrorState
 *   can call useToast if needed in the future. It wraps only MusicPlayer,
 *   so a player crash never affects the page content or navigation.
 *
 *   PageErrorBoundary lives in PageWrapper.jsx (see that file) — it wraps
 *   the <main> scroll region per-page.
 *
 * PREVIOUS FIX PRESERVED:
 *   QueryClient defaults tightened to eliminate request storm — see inline
 *   comments below for full rationale (unchanged from previous version).
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
import {
  AppErrorBoundary,
  PlayerErrorBoundary,
} from './components/errors/ErrorBoundary';

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
      // Window focus refetches are the primary trigger of the 429 storm.
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
    // ── TASK 1.3: AppErrorBoundary — outermost safety net ─────────────────
    // Placed outside QueryClientProvider and BrowserRouter so it can catch
    // catastrophic failures in those providers themselves.
    // If this fires: full-page "MeloStream ran into a problem" recovery UI.
    <AppErrorBoundary>
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

              ── TASK 1.3: PlayerErrorBoundary ─────────────────────────────
              Wraps only MusicPlayer. If the player crashes (malformed song
              data, audio API failure, bad cover URL), only the player bar
              shows an error state. Page content, sidebar, and navigation
              remain fully functional. User can retry without page refresh.
            */}
            <PlayerErrorBoundary>
              <MusicPlayer />
            </PlayerErrorBoundary>
          </ToastProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
};

export default App;