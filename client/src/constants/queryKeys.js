/**
 * client/src/constants/queryKeys.js
 *
 * SCALABLE FIX — Two new query keys added:
 *
 *   USER_PLAYLISTS  — for GET /api/users/:uid/playlists
 *   ADMIN_PLAYLISTS — for GET /api/playlists/admin
 *
 * These replace the direct Firestore onSnapshot listeners that were opening
 * persistent WebSocket connections per user. React Query now owns caching,
 * deduplication, background refetch, and stale-while-revalidate for both.
 *
 * Cache scope:
 *   USER_PLAYLISTS  → user-scoped → must be cleared on logout (see authStore.js)
 *   ADMIN_PLAYLISTS → public content → preserved across logout like SONGS
 */
export const QUERY_KEYS = {
  SONGS:           'songs',
  SEARCH:          'search',
  PLAYLISTS:       'playlists',
  LIKED_SONGS:     'liked_songs',
  USERS:           'users',
  ARTIST:          'artist',
  ARTIST_SONGS:    'artist_songs',
  ALBUM:           'album',
  ALBUM_SONGS:     'album_songs',
  USER_PLAYLISTS:  'userPlaylists',   
  ADMIN_PLAYLISTS: 'adminPlaylists',  
  SUGGESTIONS:     'suggestions', 
};