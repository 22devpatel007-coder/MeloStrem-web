/**
 * client/src/store/authStore.js
 *
 * Fix: logout now removes only user-specific React Query cache keys instead of
 * calling queryClient.clear() which nuked the public songs cache too,
 * forcing a full re-fetch for every user on every login.
 *
 * USER-SPECIFIC QUERY KEYS that are cleared on logout:
 *   - ['likedSongs']
 *   - ['playlists']
 *   - ['users']
 *   - ['playlist', *]   (any individual playlist detail)
 *
 * PUBLIC QUERY KEYS that are intentionally preserved across sessions:
 *   - ['songs']   (paginated song library — same for everyone)
 *   - ['search']  (search results — same for everyone)
 *
 * If you add a new user-specific query key in queryKeys.js, add it here too.
 */

import { create } from 'zustand';
import { logout as authServiceLogout } from '../services/auth.service';

// getQueryClient is a stable getter so authStore never imports queryClient
// at module-load time (avoids circular dependency with api.js which also
// imports authStore for token injection).
let _queryClient = null;

export const registerQueryClient = (qc) => {
  _queryClient = qc;
};

// All query keys that belong to the currently authenticated user.
// Keep this list in sync with client/src/constants/queryKeys.js.
const USER_QUERY_KEYS = [
  ['likedSongs'],
  ['playlists'],
  ['users'],
];

const clearUserCache = () => {
  if (!_queryClient) return;

  // Remove exact user-specific keys.
  USER_QUERY_KEYS.forEach((key) => {
    _queryClient.removeQueries({ queryKey: key });
  });

  // Remove any individual playlist detail queries  ['playlist', <id>].
  _queryClient.removeQueries({ queryKey: ['playlist'], exact: false });
};

const useAuthStore = create((set) => ({
  user: null,
  isAdmin: false,
  loading: true,
  likedSongs: [],           // kept for backward compat; primary source is useLikedSongs hook

  setUser: (user) => set({ user }),
  setAdmin: (isAdmin) => set({ isAdmin }),
  setLoading: (loading) => set({ loading }),
  setLikedSongs: (likedSongs) => set({ likedSongs }),

  logout: async () => {
    try {
      await authServiceLogout();
    } finally {
      // 1. Clear only user-owned cached queries — preserve public song library cache.
      clearUserCache();
      // 2. Reset auth state.
      set({ user: null, isAdmin: false, likedSongs: [] });
    }
  },
}));

export { useAuthStore };
export default useAuthStore;