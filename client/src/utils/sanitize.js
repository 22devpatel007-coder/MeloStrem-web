/**
 * client/src/utils/sanitize.js
 *
 * Phase 1 — Task 1.2: Input Sanitization (Frontend)
 *
 * Strips HTML tags and script content from untrusted strings before they
 * are rendered into the DOM. Applied to song titles, artist names, album
 * names, genre labels, and playlist names anywhere they come from the API.
 *
 * Uses DOMPurify which runs entirely in-browser — no server round-trip,
 * no bundle-size penalty from a full HTML parser. It is the industry
 * standard for frontend XSS prevention (used by Google, GitHub, etc.).
 *
 * Install: npm install dompurify   (client/)
 *
 * IMPORTANT: sanitizeDisplay() returns a PLAIN STRING — it is safe to
 * use as text content ({sanitizeDisplay(str)}) but must NOT be used
 * with dangerouslySetInnerHTML. We never use dangerouslySetInnerHTML
 * in this codebase; this note is here to prevent future misuse.
 *
 * SSR / test environments (no window.document):
 *   DOMPurify gracefully degrades — sanitizeDisplay() returns the original
 *   string unchanged. This is acceptable because SSR/test environments do
 *   not render to a real browser DOM, so XSS cannot execute.
 */

import DOMPurify from 'dompurify';

/**
 * Strips all HTML tags and potentially dangerous content from a string.
 * Returns a safe plain-text string ready for React text rendering.
 *
 * - Non-string input → returns '' (never throws)
 * - null / undefined → returns ''
 * - Clean string     → returns as-is (no unnecessary allocation)
 * - HTML/script      → returns stripped plain text
 *
 * @param {*} value — any value (typically string from API)
 * @returns {string} — safe plain text string
 */
export function sanitizeDisplay(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return '';

  // DOMPurify.sanitize with ALLOWED_TAGS:[] strips every tag and returns
  // the inner text content only. FORCE_BODY ensures correct parsing of
  // partial HTML fragments like '<script>...' without a root element.
  return DOMPurify.sanitize(value, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    FORCE_BODY: true,
  });
}