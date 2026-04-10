/**
 * client/src/utils/searchHistory.js
 *
 * Production-safe localStorage wrapper for recent search history.
 *
 * Why a separate module:
 * - Centralises all try/catch guards so callers never crash on:
 *     · Safari private mode (throws on localStorage access)
 *     · Quota-exceeded errors
 *     · Corrupt JSON (old entries, manual edits)
 * - Purely synchronous — safe to call during render (only read) or in handlers.
 * - Zero external dependencies.
 */

const STORAGE_KEY = 'melo_search_history';
const MAX_ENTRIES = 8;

/**
 * Reads the history array from localStorage.
 * Returns [] on any failure — never throws.
 *
 * @returns {string[]}
 */
export function readHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Persists `entries` to localStorage.
 * Silently swallows quota/access errors.
 *
 * @param {string[]} entries
 */
function writeHistory(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // quota exceeded or storage unavailable — degrade gracefully
  }
}

/**
 * Adds a query to history.
 * - Deduplicates case-insensitively (existing match is removed then re-added at top).
 * - Ignores queries shorter than 2 characters.
 * - Caps list at MAX_ENTRIES.
 *
 * @param {string} query
 */
export function pushHistory(query) {
  const trimmed = (query || '').trim();
  if (trimmed.length < 2) return;

  const prev = readHistory().filter(
    (q) => q.toLowerCase() !== trimmed.toLowerCase()
  );
  writeHistory([trimmed, ...prev].slice(0, MAX_ENTRIES));
}

/**
 * Removes a single entry from history by exact value.
 *
 * @param {string} query
 */
export function removeHistoryEntry(query) {
  writeHistory(readHistory().filter((q) => q !== query));
}

/**
 * Wipes all history.
 */
export function clearHistory() {
  writeHistory([]);
}