/**
 * client/src/utils/searchHistory.js — PRODUCTION READY
 *
 * Shared localStorage helper for search history.
 * Used by both SearchBar.jsx (dropdown) and Search.jsx (page section).
 * All functions are pure and safe — they never throw.
 */

const HISTORY_KEY = 'melo_search_history';
const MAX_HISTORY = 8;

export function readHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // localStorage quota exceeded or unavailable — fail silently
  }
}

export function pushHistory(query) {
  const trimmed = (query || '').trim();
  if (!trimmed || trimmed.length < 2) return;
  const prev = readHistory().filter(
    (q) => q.toLowerCase() !== trimmed.toLowerCase()
  );
  writeHistory([trimmed, ...prev].slice(0, MAX_HISTORY));
}

export function removeHistoryEntry(query) {
  writeHistory(readHistory().filter((q) => q !== query));
}

export function clearHistory() {
  writeHistory([]);
}