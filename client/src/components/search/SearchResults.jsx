import SongList from '../songs/SongList';
import { Loader } from '../ui/Loader';

export const SearchResults = ({ results, isLoading, query }) => {
  if (isLoading) return <Loader />;
  if (!query || query.length <= 1) return <p className='text-gray-500'>Start typing to search...</p>;
  if (!results?.length) return <p className='text-gray-500'>No results for "{query}"</p>;
  return <SongList songs={results} />;
};
