const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');
const env = require('../config/env');
const logger = require('../utils/logger');

// Make sure the target directory exists before multer tries to stream to it.
// On Railway the container's `uploads/` subdirectories don't exist on a
// fresh deploy — multer would throw ENOENT and the upload would silently fail.
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); }
    catch (e) { logger.error(`Failed to create upload dir ${dir}: ${e.message}`); }
  }
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isVideo = file.mimetype.startsWith('video/');
    const dir = path.join(__dirname, '../../uploads', isVideo ? 'videos' : 'images');
    ensureDir(dir);
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${randomUUID()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = [
    'image/jpeg', 'image/png', 'image/gif', 'image/webp',
    'video/mp4', 'video/quicktime', 'video/mpeg', 'video/webm', 'video/x-matroska',
  ];
  if (!allowed.includes(file.mimetype)) {
    logger.warn(`Upload rejected: unsupported mime type ${file.mimetype} for ${file.originalname}`);
    return cb(null, false);
  }
  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  // YouTube allows 256GB videos but we cap at 500MB to protect Railway's
  // ephemeral disk and 600s upload timeout. Bump MAX_FILE_SIZE in env when
  // serving longer videos.
  limits: { fileSize: env.maxFileSize || 524288000 },
});

module.exports = upload;
