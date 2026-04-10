/**
 * client/src/components/search/SearchResults.jsx
 *
 * PRODUCTION CHANGE: match highlighting added.
 *
 * What changed:
 *  - HighlightedText helper bolds the matched substring in title + artist.
 *  - escapeRegex (from fuzzyMatch util) makes user input regex-safe.
 *    Without this, input like "lo+fi" or "(test)" throws a SyntaxError.
 *
 * What did NOT change:
 *  - SongList is still used for the main results list (unchanged).
 *  - Loading / empty-query / no-results states are identical.
 *  - Props contract is unchanged: { results, isLoading, query }.
 *
 * Note: This component is used standalone (e.g. in older pages).
 * Search.jsx renders its own result list directly with SongCard for
 * more control — that highlighting lives in Search.jsx.
 */

import SongList from '../songs/SongList';
import { Loader } from '../ui/Loader';
import { escapeRegex } from '../../utils/fuzzyMatch';

// ─── Highlight helper ─────────────────────────────────────────────────────────
/**
 * Renders `text` with the first occurrence of `query` bolded in green.
 * Safe against all regex-special characters in query.
 *
 * @param {{ text: string, query: string, className?: string }} props
 */
export function HighlightedText({ text, query, className }) {
  if (!query || !text) return <span className={className}>{text}</span>;

  let pattern;
  try {
    pattern = new RegExp(`(${escapeRegex(query)})`, 'i');
  } catch {
    // Should never happen after escapeRegex, but belt-and-suspenders
    return <span className={className}>{text}</span>;
  }

  const parts = text.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <strong key={i} style={{ color: '#22c55e', fontWeight: 700 }}>
            {part}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────
export const SearchResults = ({ results, isLoading, query }) => {
  if (isLoading) return <Loader />;

  if (!query || query.length <= 1) {
    return <p className="text-gray-500">Start typing to search...</p>;
  }

  if (!results?.length) {
    return <p className="text-gray-500">No results for "{query}"</p>;
  }

  return <SongList songs={results} />;
};