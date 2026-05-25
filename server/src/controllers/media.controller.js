const mediaService = require('../services/media.service');
const logger = require('../utils/logger');

async function upload(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      // Multer dropped every file. Most common cause: mime type filter
      // rejected them (logged in middleware/upload.js as 'Upload rejected').
      logger.warn(`Upload returned no files. req.body keys: ${Object.keys(req.body).join(',') || '(none)'}`);
      return res.status(400).json({ error: 'No files uploaded — check that file type is supported (image/* or video/*)' });
    }

    logger.info(`Upload received: ${req.files.length} file(s) totalling ${req.files.reduce((s, f) => s + (f.size || 0), 0)} bytes`);

    const results = [];
    for (const file of req.files) {
      try {
        const media = await mediaService.processUpload(file, req.user.userId, req.body.teamId);
        results.push(media);
      } catch (perFileErr) {
        // Log per-file failures with the original name so we know which one
        // blew up instead of failing the whole batch silently.
        logger.error(`Upload processing failed for ${file.originalname} (${file.size} bytes, ${file.mimetype}): ${perFileErr.message}`, { stack: perFileErr.stack });
        throw perFileErr;
      }
    }

    res.status(201).json(results);
  } catch (err) {
    next(err);
  }
}

async function list(req, res, next) {
  try {
    const { page, limit, type, uploadedBy, teamId } = req.query;
    const result = await mediaService.listMedia({
      page: parseInt(page, 10) || 1,
      limit: parseInt(limit, 10) || 24,
      type,
      uploadedBy: uploadedBy ? parseInt(uploadedBy, 10) : undefined,
      teamId: teamId ? parseInt(teamId, 10) : undefined,
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function get(req, res, next) {
  try {
    const media = await mediaService.getMedia(parseInt(req.params.id, 10));
    res.json(media);
  } catch (err) {
    next(err);
  }
}

async function remove(req, res, next) {
  try {
    await mediaService.deleteMedia(parseInt(req.params.id, 10), req.user.userId, req.user.role);
    res.json({ message: 'Media deleted' });
  } catch (err) {
    next(err);
  }
}

module.exports = { upload, list, get, remove };
