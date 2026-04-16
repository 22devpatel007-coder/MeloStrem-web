/**
 * client/src/components/search/SearchResults.jsx
 *
 * Task 3.5 — List Virtualization for 10,000+ Songs
 *
 * WHAT CHANGED (surgical):
 *
 *   1. SongList now receives fetchNextPage / hasNextPage / isFetchingNextPage.
 *      For search results these are always undefined (search is not paginated
 *      via infinite query) — SongList handles missing props gracefully.
 *
 *   2. No other changes. SongList owns all virtualization logic.
 *      SearchResults is a thin pass-through — unchanged API surface.
 *
 * WHAT DID NOT CHANGE:
 *   - HighlightedText helper — identical
 *   - All loading / empty-query / no-results states — identical
 *   - Props contract: { results, isLoading, query } — identical
 *   - escapeRegex import — identical
 */

import SongList from '../songs/SongList';
import { Loader } from '../ui/Loader';
import { escapeRegex } from '../../utils/fuzzyMatch';

// ─── Highlight helper — identical to original ─────────────────────────────────
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
/**
 * @param {{ results: Song[], isLoading: boolean, query: string }} props
 */
export const SearchResults = ({ results, isLoading, query }) => {
  if (isLoading) return <Loader />;

  if (!query || query.length <= 1) {
    return <p className="text-gray-500">Start typing to search...</p>;
  }

  if (!results?.length) {
    return <p className="text-gray-500">No results for "{query}"</p>;
  }

  /*
   * Search results are a flat array — no infinite pagination.
   * fetchNextPage / hasNextPage / isFetchingNextPage are intentionally omitted.
   * SongList treats missing pagination props as "no more pages" and skips the
   * sentinel fetch trigger.
   */
  return <SongList songs={results} />;
};