import api from './api';

export const getUsers = async () => (await api.get('/users')).data.data;
export const getUserById = async (uid) => (await api.get(`/users/${uid}`)).data.data;
export const updateUserRole = async (uid, role) =>
  (await api.put(`/users/${uid}/role`, { role })).data.data;
export const getLikedSongs = async (uid) =>
  (await api.get(`/users/${uid}/liked-songs`)).data.data;
export const toggleLikeSong = async (uid, songId) =>
  (await api.post(`/users/${uid}/liked-songs/${songId}`)).data.data;
