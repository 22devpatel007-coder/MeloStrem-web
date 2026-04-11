/**
 * client/src/store/authStore.js
 *
 * SCALABLE FIX — Added 'userPlaylists' to USER_QUERY_KEYS.
 *
 * useUserPlaylists now caches data under [QUERY_KEYS.USER_PLAYLISTS, uid].
 * This is user-scoped data and must be cleared on logout so a different
 * user logging in on the same device never sees the previous user's playlists.
 *
 * ADMIN_PLAYLISTS ('adminPlaylists') is intentionally NOT in this list —
 * it is public content (same for all users) and should be preserved across
 * logout exactly like SONGS and SEARCH, so the next user gets instant
 * cached library playlists without a network round-trip.
 *
 * All other logic is completely unchanged.
 */

import { create } from 'zustand';
import { logout as authServiceLogout } from '../services/auth.service';

let _queryClient = null;

export const registerQueryClient = (qc) => {
  _queryClient = qc;
};

// All query keys that belong to the currently authenticated user.
// Keep this list in sync with client/src/constants/queryKeys.js.
const USER_QUERY_KEYS = [
  ['likedSongs'],
  ['playlists'],
  ['userPlaylists'],  // ✅ NEW — clears useUserPlaylists cache on logout
  ['users'],
];

const clearUserCache = () => {
  if (!_queryClient) return;

  USER_QUERY_KEYS.forEach((key) => {
    _queryClient.removeQueries({ queryKey: key });
  });

  // Remove any individual playlist detail queries ['playlist', <id>]
  _queryClient.removeQueries({ queryKey: ['playlist'], exact: false });
};

const useAuthStore = create((set) => ({
  user:      null,
  isAdmin:   false,
  loading:   true,
  likedSongs: [],

  setUser:       (user)       => set({ user }),
  setAdmin:      (isAdmin)    => set({ isAdmin }),
  setLoading:    (loading)    => set({ loading }),
  setLikedSongs: (likedSongs) => set({ likedSongs }),

  logout: async () => {
    try {
      await authServiceLogout();
    } finally {
      clearUserCache();
      set({ user: null, isAdmin: false, likedSongs: [] });
    }
  },
}));

export { useAuthStore };
export default useAuthStore;