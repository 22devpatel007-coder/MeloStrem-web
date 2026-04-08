/**
 * client/src/App.jsx
 *
 * Application shell.
 *
 * Layout:
 *  - h-screen + overflow-hidden on outer div = viewport cap, no body scroll
 *  - flex flex-1 min-h-0 on inner div = fills remaining space, allows
 *    descendant overflow-y-auto to work correctly (Safari + Firefox fix)
 *  - MusicPlayer mounted outside AppRoutes = persistent across route changes
 *
 * Auth fix:
 *  getIdTokenResult(true) forces fresh token to pick up custom claims (admin).
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

// ─── App ─────────────────────────────────────────────────────────────────────

const App = () => {
  const { setUser, setAdmin, setLoading } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        // Force fresh token so custom claims (admin) are always up-to-date
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
          h-screen          — cap to viewport, no body-level scroll ever
          flex flex-col     — vertical stack
          overflow-hidden   — prevent any accidental outer scroll
          bg-[#0f0f0f]      — global dark base
        */}
        <div className="h-screen flex flex-col bg-[#0f0f0f] overflow-hidden">

          {/*
            flex-1 min-h-0  — CRITICAL: fills remaining height AND tells flex
                              that children may shrink below their content size,
                              which is required for overflow-y-auto to work in
                              deeply nested containers on Safari/Firefox.
            flex             — Sidebar | PageContent side by side
            overflow-hidden  — belt-and-braces: no leaks from this row
          */}
          <div className="flex flex-1 min-h-0 overflow-hidden">
            <AppRoutes />
          </div>
        </div>

        {/*
          MusicPlayer is outside the layout div so route transitions never
          unmount it. MiniPlayerBar inside uses position:fixed — zero layout cost.
          PageWrapper's <main> uses pb-28 to keep last content row visible.
        */}
        <MusicPlayer />
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;