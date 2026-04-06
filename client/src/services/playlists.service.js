import api from "./api";

export const getPlaylists = async () => (await api.get("/playlists")).data.data;
export const getPlaylistById = async (id) =>
  (await api.get(`/playlists/${id}`)).data.data;
export const createPlaylist = async (data) =>
  (await api.post("/playlists", data)).data.data;
export const updatePlaylist = async (id, data) =>
  (await api.put(`/playlists/${id}`, data)).data.data;
export const deletePlaylist = async (id) =>
  (await api.delete(`/playlists/${id}`)).data.data;
export const addSongToPlaylist = async (playlistId, songId) =>
  (await api.post(`/playlists/${playlistId}/songs`, { songId })).data.data;
export const removeSongFromPlaylist = async (playlistId, songId) =>
  (await api.delete(`/playlists/${playlistId}/songs/${songId}`)).data.data;
