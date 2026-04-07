import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { searchSongs } from '../services/search.service';
import { QUERY_KEYS } from '../constants/queryKeys';

export const useSearch = (rawQuery, limit = 20) => {
  const [debouncedQuery, setDebouncedQuery] = useState(rawQuery);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(rawQuery), 400);
    return () => clearTimeout(timer);
  }, [rawQuery]);

  return useQuery({
    queryKey: [QUERY_KEYS.SEARCH, debouncedQuery],
    queryFn: () => searchSongs(debouncedQuery, limit),
    enabled: debouncedQuery.length > 1,
    staleTime: 30_000,
  });
};
