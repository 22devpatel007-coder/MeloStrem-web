const cloudinary = require('../config/cloudinary');
const streamifier = require('streamifier');

const uploadBuffer = (buffer, options) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
    streamifier.createReadStream(buffer).pipe(stream);
  });
};

const uploadAudio = async (fileBuffer, options = {}) => {
  return uploadBuffer(fileBuffer, {
    resource_type: 'video',
    format: 'mp3',
    ...options
  });
};

const uploadCover = async (fileBuffer, options = {}) => {
  return uploadBuffer(fileBuffer, {
    resource_type: 'image',
    ...options
  });
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
