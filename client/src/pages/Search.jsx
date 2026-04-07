import { useSearchParams } from 'react-router-dom';
import Navbar from '../components/layout/Navbar';
import SongList from '../components/songs/SongList';
import SearchBar from '../components/search/SearchBar';
import Loader from '../components/ui/Loader';
// ✅ FIX Bug 12: Search.jsx was manually reimplementing debounce + axios fetch
// instead of using the existing useSearch hook.
// Problems with the old approach:
//   - No caching — same query hit the server on every visit
//   - Duplicate debounce logic (useSearch already does 400ms debounce)
//   - Raw axios bypassed the api.js error handling and token attachment
//   - Any bug fix in useSearch had no effect on the Search page
//
// Fix: delete the manual useEffect/axios block and use useSearch directly.
import { useSearch } from '../hooks/useSearch';

const Search = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';

  // ✅ useSearch handles debounce (400ms), caching, retry, and token auth
  const { data, isLoading, isError } = useSearch(query);

  // Safely extract songs — useSearch returns { songs, total, query } shape
  const songs = data?.songs ?? [];

  return (
    <div style={styles.page}>
      <Navbar />
      <div style={styles.container}>

        <div style={styles.header}>
          <SearchBar />
        </div>

        <div style={styles.resultInfo}>
          {query.length >= 2 ? (
            <p style={styles.resultText}>
              Results for{' '}
              <span style={styles.resultQuery}>"{query}"</span>
              {!isLoading && (
                <span style={styles.resultCount}>
                  {' '}— {songs.length} found
                </span>
              )}
            </p>
          ) : (
            <p style={styles.hintText}>
              Type at least 2 characters to search
            </p>
          )}
        </div>

        {/* Error state */}
        {isError && (
          <p style={styles.errorText}>
            Search failed. Please try again.
          </p>
        )}

        {/* Results */}
        {isLoading ? <Loader /> : <SongList songs={songs} />}

      </div>
      <div style={{ height: 88 }} />
    </div>
  );
};

const styles = {
  page: {
    minHeight: '100vh',
    background: '#0f0f0f',
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  container:   { maxWidth: '1200px', margin: '0 auto', padding: '32px 20px 0' },
  header:      { marginBottom: '28px' },
  resultInfo:  { marginBottom: '20px' },
  resultText:  { color: '#9ca3af', fontSize: '14px' },
  resultQuery: { color: '#fff', fontWeight: '600' },
  resultCount: { color: '#6b7280' },
  hintText:    { color: '#6b7280', fontSize: '14px' },
  errorText:   { color: '#f87171', fontSize: '14px', marginBottom: '16px' },
};

export default Search;