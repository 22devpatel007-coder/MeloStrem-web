/**
 * client/src/App.jsx
 *
 * PRODUCTION FIX — position:fixed restoration
 *
 * ROOT CAUSE:
 *   Two ancestor divs had `overflow-hidden`:
 *     1. <div className="h-screen flex flex-col ... overflow-hidden">
 *     2. <div className="flex flex-1 min-h-0 overflow-hidden">
 *
 *   CSS rule: overflow:hidden on ANY ancestor creates a new containing block
 *   for position:fixed descendants. Fixed elements (OptionsSheet, AddToPlaylist
 *   drawer, MiniPlayerBar, modals) anchor to that div — not the viewport.
 *   This is why all sheets appeared at the bottom of the PAGE, not the SCREEN.
 *
 * FIX:
 *   Replace `overflow-hidden` with `overflow-clip` on both shell divs.
 *
 *   overflow:clip  — suppresses scroll/overflow leak exactly like hidden,
 *                    BUT does NOT create a containing block for fixed elements.
 *                    This is the correct production solution.
 *                    Browser support: 96%+ (all modern browsers, Chrome 90+,
 *                    Firefox 81+, Safari 16+).
 *
 *   Scroll is handled exclusively by <main> inside PageWrapper (overflow-y-auto).
 *   No layout changes — flex structure, h-screen, bg color all unchanged.
 *
 * WHAT DID NOT CHANGE:
 *   - QueryClientProvider, BrowserRouter, ToastProvider — identical
 *   - onAuthStateChanged auth flow — identical
 *   - MusicPlayer mounted outside layout — identical
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
      retry: 1,
      staleTime: 60_000,
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
            FIXED: overflow-hidden → overflow-clip
            overflow:clip suppresses layout overflow (same as hidden)
            but does NOT create a containing block for position:fixed.
            This means all fixed children (sheets, drawers, modals,
            MiniPlayerBar) correctly anchor to the viewport.
          */}
          <div className="h-screen flex flex-col bg-[#0f0f0f]" style={{ overflow: 'clip' }}>

            {/*
              FIXED: overflow-hidden → overflow-clip (same reason as above).
              flex-1 min-h-0 kept intact — required for Safari/Firefox
              overflow-y-auto to work in deeply nested containers.
            */}
            <div className="flex flex-1 min-h-0" style={{ overflow: 'clip' }}>
              <AppRoutes />
            </div>
          </div>

          {/*
            MusicPlayer outside layout — route transitions never unmount it.
            MiniPlayerBar inside uses position:fixed — now anchors to viewport
            correctly since no ancestor has overflow:hidden above it.
          */}
          <MusicPlayer />
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;