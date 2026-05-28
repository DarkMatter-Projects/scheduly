const path = require('path');
const fs = require('fs');
const os = require('os');
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
const pool = require('../config/db');
const storage = require('./storage.service');

ffmpeg.setFfmpegPath(ffmpegPath);

// Extract a single frame ~1s into the video and return a 600px-wide JPEG buffer
function generateVideoThumbnail(videoPath) {
  return new Promise((resolve, reject) => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lb-thumb-'));
    const tmpFile = 'frame.jpg';
    ffmpeg(videoPath)
      .on('error', (err) => {
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
        reject(err);
      })
      .on('end', async () => {
        try {
          const raw = fs.readFileSync(path.join(tmpDir, tmpFile));
          const jpg = await sharp(raw)
            .resize(600, 600, { fit: 'inside', withoutEnlargement: true })
            .jpeg({ quality: 80, progressive: false })
            .toBuffer();
          fs.rmSync(tmpDir, { recursive: true, force: true });
          resolve(jpg);
        } catch (err) {
          try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
          reject(err);
        }
      })
      .screenshots({ count: 1, timestamps: ['1'], filename: tmpFile, folder: tmpDir });
  });
}

// Instagram requires images to be:
//   - JPEG, baseline-encoded
//   - Width/height between 320 and 1440 px
//   - Aspect ratio 4:5 (0.8) to 1.91:1 (1.91)
// We normalise on upload so the same file works for both Facebook and Instagram.
const IG_MAX_DIMENSION = 1440;
const IG_MIN_DIMENSION = 320;
const IG_MIN_ASPECT = 0.8;   // 4:5 portrait
const IG_MAX_ASPECT = 1.91;  // 1.91:1 landscape

// Compute padding needed (top/bottom/left/right) to nudge image into IG's
// allowed aspect ratio range. Returns { extend } to pass to sharp.
function calcAspectPad(w, h) {
  const aspect = w / h;
  let canvasW = w;
  let canvasH = h;
  if (aspect < IG_MIN_ASPECT) {
    canvasW = Math.round(h * IG_MIN_ASPECT); // widen sides
  } else if (aspect > IG_MAX_ASPECT) {
    canvasH = Math.round(w / IG_MAX_ASPECT); // taller top/bottom
  } else {
    return null; // already in range
  }
  const top = Math.round((canvasH - h) / 2);
  const left = Math.round((canvasW - w) / 2);
  return {
    top, left,
    bottom: canvasH - h - top,
    right: canvasW - w - left,
    background: { r: 255, g: 255, b: 255 },
    canvasW, canvasH,
  };
}

async function processUpload(file, userId, teamId) {
  const isImage = file.mimetype.startsWith('image/');
  const isVideo = file.mimetype.startsWith('video/');
  let width = null;
  let height = null;
  let thumbnailRelPath = null;
  let finalSize = file.size;
  let finalMime = file.mimetype;

  // Process image: re-encode to baseline JPEG, generate thumbnail.
  let imageBuffer = null;
  let thumbBuffer = null;

  if (isImage) {
    try {
      // Step 1: rotate (honour EXIF) + resize to max 1440px
      let pipeline = sharp(file.path)
        .rotate()
        .resize(IG_MAX_DIMENSION, IG_MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true });

      // Read metadata after resize so we can compute aspect-ratio padding
      const intermediate = await pipeline.toBuffer();
      const interMeta = await sharp(intermediate).metadata();
      const pad = calcAspectPad(interMeta.width, interMeta.height);

      // Step 2: pad to a valid IG aspect ratio if needed, then encode baseline JPEG
      let pipeline2 = sharp(intermediate);
      if (pad) {
        pipeline2 = pipeline2.extend(pad);
        console.log(`Upload: padded ${interMeta.width}x${interMeta.height} -> ${pad.canvasW}x${pad.canvasH} for IG aspect`);
      }
      imageBuffer = await pipeline2
        .jpeg({ quality: 90, progressive: false, optimiseCoding: true })
        .toBuffer();

      const finalMeta = await sharp(imageBuffer).metadata();
      width = finalMeta.width;
      height = finalMeta.height;
      finalSize = imageBuffer.length;
      finalMime = 'image/jpeg';

      // Square thumbnail (always 1:1, OK for any platform)
      thumbBuffer = await sharp(imageBuffer)
        .resize(300, 300, { fit: 'cover' })
        .jpeg({ quality: 80, progressive: false })
        .toBuffer();
    } catch (err) {
      console.error('Image processing failed:', err.message);
    }
  }

  // Extract a thumbnail frame for videos so the library can show a preview
  if (isVideo) {
    try {
      thumbBuffer = await generateVideoThumbnail(file.path);
    } catch (err) {
      console.error('Video thumbnail failed:', err.message);
    }
  }

  // Storage keys (used for both R2 and local)
  const fileKey = `${isVideo ? 'videos' : 'images'}/${file.filename}`;
  const thumbBase = file.filename.replace(/\.[^.]+$/, '');
  const thumbKey = thumbBuffer ? `thumbnails/thumb_${thumbBase}.jpg` : null;

  if (storage.isEnabled()) {
    // Upload to R2
    if (isImage && imageBuffer) {
      await storage.uploadToR2(fileKey, imageBuffer, finalMime);
    } else {
      // Video or no processing — upload original from disk
      await storage.uploadToR2(fileKey, file.path, finalMime);
    }
    if (thumbBuffer && thumbKey) {
      await storage.uploadToR2(thumbKey, thumbBuffer, 'image/jpeg');
    }
    // Delete local temp file since R2 has the canonical copy
    try { fs.unlinkSync(file.path); } catch (e) { /* ignore */ }
  } else {
    // Local-disk fallback (dev / no R2 configured)
    if (isImage && imageBuffer) {
      fs.writeFileSync(file.path, imageBuffer); // overwrite original with normalised version
    }
    if (thumbBuffer && thumbKey) {
      const thumbDir = path.join(__dirname, '../../uploads/thumbnails');
      if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
      fs.writeFileSync(path.join(__dirname, '../../uploads', thumbKey), thumbBuffer);
    }
  }

  thumbnailRelPath = thumbKey;

  const [result] = await pool.execute(
    `INSERT INTO media (original_name, file_name, file_path, mime_type, file_size, width, height, thumbnail_path, uploaded_by, team_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [file.originalname, file.filename, fileKey, finalMime, finalSize, width, height, thumbnailRelPath, userId, teamId || null]
  );

  return getMedia(result.insertId);
}

async function getMedia(id) {
  const [rows] = await pool.execute(
    `SELECT m.*, u.first_name, u.last_name FROM media m
     JOIN users u ON m.uploaded_by = u.id
     WHERE m.id = ?`,
    [id]
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Media not found'), { status: 404 });
  }
  return formatMedia(rows[0]);
}

async function listMedia({ page = 1, limit = 24, type, uploadedBy, teamId }) {
  let where = '1=1';
  const params = [];

  if (type === 'image') {
    where += " AND m.mime_type LIKE 'image/%'";
  } else if (type === 'video') {
    where += " AND m.mime_type LIKE 'video/%'";
  }

  if (uploadedBy) {
    where += ' AND m.uploaded_by = ?';
    params.push(uploadedBy);
  }

  if (teamId) {
    where += ' AND m.team_id = ?';
    params.push(teamId);
  }

  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM media m WHERE ${where}`,
    params
  );

  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 24));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  const [rows] = await pool.execute(
    `SELECT m.*, u.first_name, u.last_name FROM media m
     JOIN users u ON m.uploaded_by = u.id
     WHERE ${where}
     ORDER BY m.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );

  return {
    data: rows.map(formatMedia),
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      pages: Math.ceil(countRows[0].total / limit),
    },
  };
}

async function deleteMedia(id, userId, userRole) {
  const media = await getMedia(id);

  if (userRole !== 'admin' && userRole !== 'manager' && media.uploadedBy !== userId) {
    throw Object.assign(new Error('Not authorized to delete this media'), { status: 403 });
  }

  if (storage.isEnabled()) {
    await storage.deleteFromR2(media.filePath);
    if (media.thumbnailPath) await storage.deleteFromR2(media.thumbnailPath);
  } else {
    const filePath = path.join(__dirname, '../../uploads', media.filePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (media.thumbnailPath) {
      const thumbPath = path.join(__dirname, '../../uploads', media.thumbnailPath);
      if (fs.existsSync(thumbPath)) fs.unlinkSync(thumbPath);
    }
  }

  await pool.execute('DELETE FROM media WHERE id = ?', [id]);
}

function formatMedia(row) {
  return {
    id: row.id,
    originalName: row.original_name,
    fileName: row.file_name,
    filePath: row.file_path,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    width: row.width,
    height: row.height,
    thumbnailPath: row.thumbnail_path,
    uploadedBy: row.uploaded_by,
    uploaderName: row.first_name ? `${row.first_name} ${row.last_name}` : undefined,
    teamId: row.team_id,
    createdAt: row.created_at,
    url: storage.publicUrlFor(row.file_path),
    thumbnailUrl: row.thumbnail_path ? storage.publicUrlFor(row.thumbnail_path) : null,
  };
}

module.exports = { processUpload, getMedia, listMedia, deleteMedia };
