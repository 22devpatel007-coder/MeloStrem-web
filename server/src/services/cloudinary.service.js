const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

// CHANGE: add timeoutMs param (default 60s for audio, 30s for images)
const uploadBuffer = (buffer, options, timeoutMs = 60000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('Cloudinary upload timed out'), { code: 'CLOUDINARY_TIMEOUT' }));
    }, timeoutMs);

    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

// Pass timeoutMs through
const uploadAudio = async (fileBuffer, options = {}) => {
  return uploadBuffer(fileBuffer, { resource_type: 'video', format: 'mp3', ...options }, 200000); // 2min for audio
};

const uploadCover = async (fileBuffer, options = {}) => {
  return uploadBuffer(fileBuffer, { resource_type: 'image', ...options }, 30000); // 30s for images
};

const deleteAsset = async (publicId, options = {}) => {
  try {
    return await cloudinary.uploader.destroy(publicId, options);
  } catch (err) {
    console.warn(`[deleteAsset] Failed to delete asset with publicId ${publicId}:`, err.message);
  }
};

const generateSignedUploadUrl = (folder) => {
  // Stub for client-side direct upload
  const timestamp = Math.round(new Date().getTime() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder },
    cloudinary.config().api_secret
  );
  return { timestamp, signature, folder, apiKey: cloudinary.config().api_key, cloudName: cloudinary.config().cloud_name };
};

module.exports = {
  uploadAudio,
  uploadCover,
  deleteAsset,
  generateSignedUploadUrl
};
