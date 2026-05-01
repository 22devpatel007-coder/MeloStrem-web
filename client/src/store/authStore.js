/**
 * client/src/store/authStore.js
 *
 * PRODUCTION READY — No logic changes from previous version.
 *
 * USER_QUERY_KEYS lists all query keys that are user-scoped and must be
 * wiped on logout so a different user on the same device never sees
 * another user's data.
 *
 * Cache scope summary:
 *   USER-SCOPED (cleared on logout):
 *     ['likedSongs']    — liked songs are private per user
 *     ['playlists']     — admin CRUD hook cache (scoped to session)
 *     ['userPlaylists'] — useUserPlaylists: matches ['userPlaylists', uid] by prefix
 *     ['users']         — admin user list
 *     ['playlist', id]  — individual playlist detail pages
 *
 *   PUBLIC (preserved across logout — same for all users, no PII):
 *     ['songs']         — library song list
 *     ['search']        — search results
 *     ['adminPlaylists']— public admin/library playlists
 *     ['artist*']       — artist detail and songs
 *     ['album*']        — album detail and songs
 */
import { create } from 'zustand';
import { logout as authServiceLogout, verifyWithBackend } from '../services/auth.service';
import { sendOffline } from '../services/users.service';
import { setUserId } from '../services/errorReporter';

let _queryClient = null;

export const registerQueryClient = (qc) => {
  _queryClient = qc;
};

// All query keys that belong to the currently authenticated user.
// Keep this list in sync with client/src/constants/queryKeys.js.
//
// NOTE: removeQueries({ queryKey: ['userPlaylists'] }) matches ALL keys that
// start with 'userPlaylists', including ['userPlaylists', uid] — no need to
// pass the uid here.
const USER_QUERY_KEYS = [
  ['likedSongs'],
  ['playlists'],
  ['userPlaylists'],  // clears useUserPlaylists cache (uid-scoped) on logout
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
  user:       null,
  isAdmin:    false,
  loading:    true,
  likedSongs: [],

  setUser: (user) => {
  setUserId(user?.uid ?? null);
  set({ user });
  // Ensure Firestore user document exists (creates it for Google/first-time logins)
  if (user) {
      verifyWithBackend().catch(() => {}); // fire-and-forget, non-blocking
  }
},
  setAdmin:      (isAdmin)    => set({ isAdmin }),
  setLoading:    (loading)    => set({ loading }),
  setLikedSongs: (likedSongs) => set({ likedSongs }),

  logout: async () => {
    const currentUser = useAuthStore.getState().user;
    if (currentUser) {
      sendOffline(currentUser.uid).catch(() => {});
    }
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