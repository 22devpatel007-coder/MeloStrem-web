// Stub — will connect to Redis/Upstash in production
// Replace these no-ops with ioredis or @upstash/redis calls when ready
const cache = {
  get: async (key) => null,
  set: async (key, value, ttl) => null,
  del: async (key) => null,
};

module.exports = cache;
