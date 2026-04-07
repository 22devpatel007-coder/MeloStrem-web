const PlaylistSchema = {
  id: 'string',
  name: 'string',
  description: 'string',
  coverUrl: 'string',
  songs: 'array',
  createdBy: 'string',
  isPublic: 'boolean',
  createdAt: 'timestamp',
  updatedAt: 'timestamp',
};

const createPlaylistDefaults = () => ({
  description: '',
  coverUrl: '',
  songs: [],
  isPublic: false,
  createdAt: new Date(),
  updatedAt: new Date(),
});

module.exports = { PlaylistSchema, createPlaylistDefaults };
