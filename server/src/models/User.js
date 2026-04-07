const ROLES = { USER: 'user', ADMIN: 'admin' };

const UserSchema = {
  uid: 'string',
  email: 'string',
  displayName: 'string',
  role: 'string',
  createdAt: 'timestamp',
  likedSongs: 'array',
};

const createUserDefaults = () => ({
  role: ROLES.USER,
  createdAt: new Date(),
  likedSongs: [],
});

module.exports = { UserSchema, ROLES, createUserDefaults };
