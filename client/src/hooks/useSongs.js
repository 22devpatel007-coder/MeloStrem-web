import { useInfiniteQuery } from '@tanstack/react-query';
import { getSongs } from '../services/songs.service';
import { QUERY_KEYS } from '../constants/queryKeys';

export const useSongs = (limit = 30) => {
  const query = useInfiniteQuery({
    queryKey: [QUERY_KEYS.SONGS],
    queryFn: ({ pageParam }) => getSongs(limit, pageParam),
    getNextPageParam: (lastPage) => lastPage.hasMore ? lastPage.nextCursor : undefined,
    initialPageParam: null,
  });

  const songs = query.data?.pages.flatMap((p) => p.songs) ?? [];

  return {
    data: query.data,
    error: query.error,
    songs,
    fetchNextPage: query.fetchNextPage,
    hasNextPage: query.hasNextPage,
    isLoading: query.isLoading,
    isFetchingNextPage: query.isFetchingNextPage,
    refetch: query.refetch,
  };
};
