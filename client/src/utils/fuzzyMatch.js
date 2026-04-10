/**
 * client/src/utils/fuzzyMatch.js
 *
 * Lightweight fuzzy match utility for the "did you mean?" fallback in Search.jsx.
 *
 * Design decisions:
 * - No external dependencies (no fuse.js etc.) — keeps bundle lean.
 * - Two-pass strategy: first tries substring/prefix (fast), then trigram similarity (fuzzy).
 * - escapeRegex is exported separately and used by SearchResults highlight too.
 * - All functions are pure — safe to call inside useMemo with zero side-effects.
 * - Capped at maxResults (default 3) to keep rendering cost predictable.
 */

// ─── Regex escape ─────────────────────────────────────────────────────────────
/**
 * Escapes a user-supplied string so it is safe to pass to `new RegExp(...)`.
 * Without this, input like "lo+fi" or "(test)" throws a SyntaxError.
 *
 * @param {string} str
 * @returns {string}
 */
export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Trigram helpers ──────────────────────────────────────────────────────────
/**
 * Builds a Set of trigrams (3-char substrings) from a string.
 * "hello" → {"hel","ell","llo"}
 *
 * @param {string} str
 * @returns {Set<string>}
 */
function trigrams(str) {
  const s = str.toLowerCase();
  const out = new Set();
  for (let i = 0; i <= s.length - 3; i++) {
    out.add(s.slice(i, i + 3));
  }
  return out;
}

/**
 * Dice coefficient between two trigram sets: 2 * |intersection| / (|A| + |B|).
 * Returns 0–1 where 1 is identical.
 *
 * @param {Set<string>} a
 * @param {Set<string>} b
 * @returns {number}
 */
function diceCoefficient(a, b) {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const t of a) {
    if (b.has(t)) shared++;
  }
  return (2 * shared) / (a.size + b.size);
}

// ─── Main export ──────────────────────────────────────────────────────────────
/**
 * Returns up to `maxResults` songs from `candidates` that fuzzy-match `query`.
 *
 * Pass 1: substring / prefix match on title + artist (fast, O(n)).
 * Pass 2: trigram similarity ≥ threshold (catches typos like "eminen" → Eminem).
 *
 * @param {string}   query        - Raw user input (not escaped here — we handle it internally).
 * @param {Array}    candidates   - Song objects with at least { id, title, artist }.
 * @param {object}   [options]
 * @param {number}   [options.maxResults=3]   - Max suggestions to return.
 * @param {number}   [options.threshold=0.35] - Minimum dice similarity for pass 2.
 * @returns {Array}  Matched songs, ordered by score descending.
 */
export function fuzzyMatch(query, candidates, { maxResults = 3, threshold = 0.35 } = {}) {
  if (!query || query.length < 2 || !Array.isArray(candidates) || !candidates.length) {
    return [];
  }

  const q = query.trim().toLowerCase();
  if (!q) return [];

  const queryTrigrams = trigrams(q);
  const seen = new Set();
  const scored = [];

  for (const song of candidates) {
    if (!song || seen.has(song.id)) continue;

    const title  = (song.title  || '').toLowerCase();
    const artist = (song.artist || '').toLowerCase();

    let score = 0;

    // Pass 1: substring / prefix (higher weight)
    if (title === q || artist === q)           score = 10;
    else if (title.startsWith(q) || artist.startsWith(q)) score = 7;
    else if (title.includes(q) || artist.includes(q))     score = 5;

    // Pass 2: trigram fuzzy (only if pass 1 missed)
    if (score === 0) {
      const titleSim  = diceCoefficient(queryTrigrams, trigrams(title));
      const artistSim = diceCoefficient(queryTrigrams, trigrams(artist));
      const best = Math.max(titleSim, artistSim);
      if (best >= threshold) score = best * 4; // normalise to roughly 0–4
    }

    if (score > 0) {
      seen.add(song.id);
      scored.push({ song, score });
    }
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ song }) => song);
}