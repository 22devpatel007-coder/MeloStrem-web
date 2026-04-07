const cache = require('../config/redis');

const getCache = async (key) => {
  return await cache.get(key);
};

const setCache = async (key, value, ttlSeconds) => {
  return await cache.set(key, value, ttlSeconds);
};

const invalidateCache = async (key) => {
  return await cache.del(key);
};

module.exports = {
  getCache,
  setCache,
  invalidateCache
};
