/**
 * client/src/utils/errorMessages.js
 *
 * Task 2.4 — Error Code → User Message Map
 *
 * SINGLE SOURCE OF TRUTH for all user-facing error strings.
 *
 * HOW IT WORKS:
 *   1. Backend returns { success: false, error: { code, message } }
 *   2. Axios service layer catches this and the code lands in error.response.data.error.code
 *   3. getErrorMessage() reads that code and returns the right user string
 *   4. If no code match → context-based fallback → generic fallback
 *
 * ADDING NEW ERRORS:
 *   Add a new entry to ERROR_MESSAGES below. The key is the error code
 *   string from shared/constants/errorCodes.js. The value is what users see.
 *   Never use technical language in user messages.
 *
 * ERROR SEVERITY:
 *   ERROR   — action failed, user needs to know (red toast, 8s)
 *   WARNING — action partially succeeded or user input issue (amber toast, 6s)
 *   INFO    — informational, non-blocking (blue toast, 4s)
 *   SUCCESS — positive confirmation (green toast, 3s)
 */

// ── Severity constants ────────────────────────────────────────────────────────
export const ERROR_SEVERITY = {
  ERROR:   'error',
  WARNING: 'warning',
  INFO:    'info',
  SUCCESS: 'success',
};

// ── Error code → user-safe message map ───────────────────────────────────────
// Keys must match the `code` field in shared/constants/errorCodes.js exactly.
const ERROR_MESSAGES = {
  // ── Auth ──────────────────────────────────────────────────────────────────
  AUTH_TOKEN_MISSING:    'Please log in to continue.',
  AUTH_TOKEN_INVALID:    'Your session is invalid. Please log in again.',
  AUTH_TOKEN_EXPIRED:    'Your session has expired. Please log in again.',
  AUTH_TOKEN_REVOKED:    'Your session was ended. Please log in again.',
  AUTH_FORBIDDEN:        'You don\'t have permission to do that.',
  AUTH_ADMIN_REQUIRED:   'This action requires admin access.',

  // ── Songs ─────────────────────────────────────────────────────────────────
  SONG_NOT_FOUND:        'This song could not be found.',
  SONG_DUPLICATE:        'A song with this title and artist already exists.',
  SONG_UPLOAD_FAILED:    'Song upload failed. Please try again.',
  SONG_DELETE_FAILED:    'Could not delete this song. Please try again.',
  SONG_UPDATE_FAILED:    'Could not update this song. Please try again.',
  SONGS_LOAD_FAILED:     'Could not load songs. Please refresh the page.',
  SONGS_BATCH_FAILED:    'Could not load some songs. Please refresh.',

  // ── Playlists ─────────────────────────────────────────────────────────────
  PLAYLIST_NOT_FOUND:    'This playlist could not be found.',
  PLAYLIST_CREATE_FAILED:'Could not create playlist. Please try again.',
  PLAYLIST_UPDATE_FAILED:'Could not update playlist. Please try again.',
  PLAYLIST_DELETE_FAILED:'Could not delete playlist. Please try again.',
  PLAYLIST_LOAD_FAILED:  'Could not load playlists. Please refresh.',
  PLAYLIST_ADD_SONG_FAILED:    'Could not add song to playlist.',
  PLAYLIST_REMOVE_SONG_FAILED: 'Could not remove song from playlist.',

  // ── Liked songs ───────────────────────────────────────────────────────────
  LIKED_SONGS_LOAD_FAILED:   'Could not load your liked songs.',
  LIKED_SONGS_TOGGLE_FAILED: 'Could not update liked song. Please try again.',

  // ── Artists / Albums ──────────────────────────────────────────────────────
  ARTIST_NOT_FOUND:      'This artist could not be found.',
  ARTIST_LOAD_FAILED:    'Could not load artist. Please try again.',
  ALBUM_NOT_FOUND:       'This album could not be found.',
  ALBUM_LOAD_FAILED:     'Could not load album. Please try again.',

  // ── Search ────────────────────────────────────────────────────────────────
  SEARCH_FAILED:         'Search is temporarily unavailable. Please try again.',

  // ── Rate limiting ─────────────────────────────────────────────────────────
  RATE_LIMIT_EXCEEDED:   'You\'re doing that too fast. Please wait a moment.',
  RATE_LIMIT_SEARCH:     'Search limit reached. Please wait a moment.',

  // ── Network / Server ──────────────────────────────────────────────────────
  NETWORK_ERROR:         'Connection failed. Please check your internet and try again.',
  SERVER_ERROR:          'Something went wrong on our end. Please try again.',
  SERVICE_UNAVAILABLE:   'Service is temporarily unavailable. Please try again shortly.',
  TIMEOUT:               'The request timed out. Please try again.',

  // ── Validation ────────────────────────────────────────────────────────────
  VALIDATION_FAILED:     'Please check your input and try again.',
  INVALID_INPUT:         'Some fields contain invalid values.',

  // ── Users ─────────────────────────────────────────────────────────────────
  USER_NOT_FOUND:        'User could not be found.',
  SESSION_PICKS_FAILED:  'Listening data could not be saved.',

  // ── Firebase-specific codes ───────────────────────────────────────────────
  // These appear in error.code when Firebase client SDK throws directly
  'auth/user-not-found':     'No account found with this email.',
  'auth/wrong-password':     'Incorrect password.',
  'auth/email-already-in-use': 'An account with this email already exists.',
  'auth/too-many-requests':  'Too many attempts. Please wait and try again.',
  'auth/network-request-failed': 'Connection failed. Please check your internet.',
  'auth/invalid-email':      'Please enter a valid email address.',
  'auth/weak-password':      'Password must be at least 6 characters.',
  'auth/user-disabled':      'This account has been disabled.',
  'auth/popup-closed-by-user': 'Sign-in was cancelled.',
};

// ── Context-based fallback messages ──────────────────────────────────────────
// When the error code is unknown, we fall back to a context-aware string.
// Context is the human-readable action string passed by the caller.
const CONTEXT_FALLBACKS = {
  'loading songs':          'Could not load songs. Please refresh.',
  'loading liked songs':    'Could not load your liked songs.',
  'loading playlists':      'Could not load playlists. Please refresh.',
  'loading artist':         'Could not load artist. Please try again.',
  'loading album':          'Could not load album. Please try again.',
  'loading search results': 'Search failed. Please try again.',
  'saving playlist':        'Could not save playlist. Please try again.',
  'deleting playlist':      'Could not delete playlist. Please try again.',
  'liking track':           'Could not update liked song. Please try again.',
  'uploading song':         'Upload failed. Please try again.',
};

// ── Generic fallback ──────────────────────────────────────────────────────────
const GENERIC_FALLBACK = 'Something went wrong. Please try again.';

// ── HTTP status → message map (last resort) ───────────────────────────────────
const HTTP_STATUS_MESSAGES = {
  400: 'Invalid request. Please check your input.',
  401: 'Please log in to continue.',
  403: 'You don\'t have permission to do that.',
  404: 'The requested item could not be found.',
  409: 'This item already exists.',
  429: 'You\'re doing that too fast. Please wait a moment.',
  500: 'Something went wrong on our end. Please try again.',
  502: 'Service temporarily unavailable. Please try again.',
  503: 'Service is down for maintenance. Please try again shortly.',
};

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Maps any error object to a user-safe display string.
 *
 * Priority order:
 *   1. Backend error code  (error.response.data.error.code)
 *   2. Firebase client error code  (error.code)
 *   3. HTTP status code  (error.response.status)
 *   4. Context-based fallback
 *   5. Generic fallback
 *
 * NEVER returns a technical string. NEVER exposes stack traces.
 * NEVER returns undefined.
 *
 * @param {Error|null|unknown} error
 * @param {string} [context]  - e.g. 'loading songs', 'saving playlist'
 * @returns {string}
 */
export const getErrorMessage = (error, context = '') => {
  if (!error) return GENERIC_FALLBACK;

  try {
    // ── 1. Backend { success: false, error: { code } } shape ─────────────────
    const backendCode = error?.response?.data?.error?.code;
    if (backendCode && ERROR_MESSAGES[backendCode]) {
      return ERROR_MESSAGES[backendCode];
    }

    // ── 2. Firebase client SDK error code ────────────────────────────────────
    const firebaseCode = error?.code;
    if (firebaseCode && ERROR_MESSAGES[firebaseCode]) {
      return ERROR_MESSAGES[firebaseCode];
    }

    // ── 3. HTTP status code ───────────────────────────────────────────────────
    const httpStatus = error?.response?.status;
    if (httpStatus && HTTP_STATUS_MESSAGES[httpStatus]) {
      return HTTP_STATUS_MESSAGES[httpStatus];
    }

    // ── 4. Network error (no response at all) ─────────────────────────────────
    if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
      return ERROR_MESSAGES.NETWORK_ERROR;
    }

    // ── 5. Context-based fallback ─────────────────────────────────────────────
    const normalizedContext = context.toLowerCase().trim();
    if (normalizedContext && CONTEXT_FALLBACKS[normalizedContext]) {
      return CONTEXT_FALLBACKS[normalizedContext];
    }

    // ── 6. Generic fallback ───────────────────────────────────────────────────
    return GENERIC_FALLBACK;
  } catch {
    // getErrorMessage itself must never throw
    return GENERIC_FALLBACK;
  }
};

/**
 * Returns true if this error should be retried automatically.
 * 4xx errors (except 429) are not transient — no point retrying.
 *
 * @param {Error} error
 * @returns {boolean}
 */
export const isRetryableError = (error) => {
  const status = error?.response?.status;
  if (!status) return true;               // network error — worth retrying
  if (status === 429) return true;        // rate limit — retry after backoff
  if (status >= 500) return true;         // server error — transient
  return false;                           // 4xx client errors — do not retry
};