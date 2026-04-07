import api from './api';

export const searchSongs = async (query, limit = 20) => {
  const res = await api.get('/search', { params: { q: query, limit } });
  return res.data?.data ?? res.data;
};
