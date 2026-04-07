/**
 * client/src/services/playlists.service.js
 *
 * ADDED: getPlaylistSongs(songIds)
 *   Fetches full Song objects for a given array of song IDs.
 *   Calls POST /api/songs/batch — one round-trip regardless of playlist size.
 *   Returns Song[] in the same order as songIds (missing IDs silently dropped).
 *
 *   Used by PlaylistDetail to remove the useSongs() pagination dependency.
 *   Previously PlaylistDetail cross-referenced songIds against the paginated
 *   library — songs not yet fetched via pagination were invisible.
 *   This fix guarantees all playlist songs appear immediately on load.
 *
 * All existing service functions unchanged.
 */

import api from './api';

export const getPlaylists = async () =>
  (await api.get('/playlists')).data.data;

export const getPlaylistById = async (id) =>
  (await api.get(`/playlists/${id}`)).data.data;

export const createPlaylist = async (data) =>
  (await api.post('/playlists', data)).data.data;

export const updatePlaylist = async (id, data) =>
  (await api.put(`/playlists/${id}`, data)).data.data;

export const deletePlaylist = async (id) =>
  (await api.delete(`/playlists/${id}`)).data.data;

export const addSongToPlaylist = async (playlistId, songId) =>
  (await api.post(`/playlists/${playlistId}/songs`, { songId })).data.data;

export const removeSongFromPlaylist = async (playlistId, songId) =>
  (await api.delete(`/playlists/${playlistId}/songs/${songId}`)).data.data;

/**
 * Fetches full Song objects for an array of song IDs in one round-trip.
 * Calls POST /api/songs/batch with the ID array.
 * Returns Song[] — IDs not found in Firestore are silently omitted.
 *
 * @param {string[]} songIds
 * @returns {Promise<Song[]>}
 */
export const getPlaylistSongs = async (songIds) => {
  if (!Array.isArray(songIds) || songIds.length === 0) return [];

  try {
    const res = await api.post('/songs/batch', { ids: songIds });
    const songs = res?.data?.data ?? res?.data ?? [];
    return Array.isArray(songs) ? songs : [];
  } catch (err) {
    console.error('[playlists.service] getPlaylistSongs error:', err.message);
    throw err;
  }
};