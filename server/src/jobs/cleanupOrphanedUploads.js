const logger = require('../utils/logger');

/**
 * Stub job to cleanup orphaned uploads in Cloudinary.
 * Currently just logs that it's running.
 */
const cleanupOrphanedUploads = () => {
  logger.info("cleanup job running");
  // TODO: Add logic to fetch all Cloudinary assets in folder 
  // and match with Firestore records to delete orphans.
};

module.exports = { cleanupOrphanedUploads };
