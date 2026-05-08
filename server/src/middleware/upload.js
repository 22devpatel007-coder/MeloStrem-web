const multer = require('multer');

const storage = multer.memoryStorage();

/**
 * PERMANENT SOLUTION — upload middleware
 *
 * The fileFilter must NOT reject missing files for PATCH /api/songs/:id
 * because the cover is optional on edit (only metadata may be changing).
 * multer only calls fileFilter for files that ARE present, so the filter
 * below only needs to validate mime types — not enforce presence.
 * Presence validation is done in the controller.
 */
const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100 MB
    files: 2,                    // song + cover at most
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === 'song') {
      if (!file.mimetype.startsWith('audio/')) {
        return cb(
          Object.assign(new Error('Only audio files are allowed for the song field'), { status: 400 })
        );
      }
    } else if (file.fieldname === 'cover') {
      if (!file.mimetype.startsWith('image/')) {
        return cb(
          Object.assign(new Error('Only image files are allowed for the cover field'), { status: 400 })
        );
      }
    } else {
      return cb(
        Object.assign(new Error(`Unexpected field: ${file.fieldname}`), { status: 400 })
      );
    }
    cb(null, true);
  },
});

module.exports = upload;