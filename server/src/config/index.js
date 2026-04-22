require('dotenv').config();

const config = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  // ✅ Fixed: use array for multiple origins (local dev + network + prod)
  clientOrigin: (
    process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN.split(',').map(o => o.trim())
      : ['http://localhost:3000']
  ),
backendUrl: process.env.BACKEND_URL || process.env.RENDER_EXTERNAL_URL || null,
keepAliveIntervalMs: process.env.KEEP_ALIVE_INTERVAL_MS
  ? parseInt(process.env.KEEP_ALIVE_INTERVAL_MS, 10)
  : 14 * 60 * 1000,
};

const required = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
];

if (process.env.NODE_ENV !== 'test') {
  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
  }
}

module.exports = config;