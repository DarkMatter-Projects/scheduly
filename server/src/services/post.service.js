const pool = require('../config/db');
const storage = require('./storage.service');
const sentiment = require('./sentiment.service');

// Convert an ISO 8601 string (or anything Date accepts) into the
// MySQL DATETIME format: YYYY-MM-DD HH:MM:SS (UTC).
function toMysqlDatetime(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

async function createPost({ title, content, postType, createdBy, teamId, mediaIds, targetAccountIds }) {
  const s = sentiment.analyze(content);
  const [result] = await pool.execute(
    `INSERT INTO posts (title, content, caption_sentiment_score, caption_sentiment_label, post_type, status, created_by, team_id)
     VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
    [title || null, content, s.comparative, s.label, postType || 'text', createdBy, teamId || null]
  );

  const postId = result.insertId;

  if (mediaIds && mediaIds.length > 0) {
    for (let i = 0; i < mediaIds.length; i++) {
      await pool.execute(
        'INSERT INTO post_media (post_id, media_id, sort_order) VALUES (?, ?, ?)',
        [postId, mediaIds[i], i]
      );
    }
    // Auto-detect post type from media
    const detectedType = mediaIds.length > 1 ? 'carousel' : postType || 'image';
    await pool.execute('UPDATE posts SET post_type = ? WHERE id = ?', [detectedType, postId]);
  }

  // Add social account targets
  if (targetAccountIds && targetAccountIds.length > 0) {
    for (const accountId of targetAccountIds) {
      await pool.execute(
        'INSERT INTO post_targets (post_id, social_account_id) VALUES (?, ?)',
        [postId, accountId]
      );
    }
  }

  return getPost(postId);
}

async function getPost(id) {
  const [rows] = await pool.execute(
    `SELECT p.*,
            u.first_name AS creator_first_name, u.last_name AS creator_last_name,
            a.first_name AS assignee_first_name, a.last_name AS assignee_last_name
     FROM posts p
     JOIN users u ON p.created_by = u.id
     LEFT JOIN users a ON p.assigned_to = a.id
     WHERE p.id = ?`,
    [id]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('Post not found'), { status: 404 });
  }

  const post = formatPost(rows[0]);

  // Get attached media
  const [media] = await pool.execute(
    `SELECT m.*, pm.sort_order FROM media m
     JOIN post_media pm ON m.id = pm.media_id
     WHERE pm.post_id = ?
     ORDER BY pm.sort_order`,
    [id]
  );

  post.media = media.map(m => ({
    id: m.id,
    originalName: m.original_name,
    fileName: m.file_name,
    filePath: m.file_path,
    mimeType: m.mime_type,
    fileSize: m.file_size,
    width: m.width,
    height: m.height,
    url: storage.publicUrlFor(m.file_path),
    thumbnailUrl: m.thumbnail_path ? storage.publicUrlFor(m.thumbnail_path) : null,
    sortOrder: m.sort_order,
  }));

  // Get post targets
  const [targets] = await pool.execute(
    `SELECT pt.*, sa.platform, sa.account_name, sa.profile_picture_url
     FROM post_targets pt
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE pt.post_id = ?`,
    [id]
  );

  post.targets = targets.map(t => ({
    id: t.id,
    socialAccountId: t.social_account_id,
    platform: t.platform,
    accountName: t.account_name,
    profilePictureUrl: t.profile_picture_url,
    platformPostId: t.platform_post_id,
    status: t.status,
    errorMessage: t.error_message,
    publishedAt: t.published_at,
  }));

  // Get approval history
  const [approvals] = await pool.execute(
    `SELECT a.*, u.first_name, u.last_name
     FROM approvals a JOIN users u ON a.reviewer_id = u.id
     WHERE a.post_id = ?
     ORDER BY a.decided_at DESC`,
    [id]
  );

  post.approvals = approvals.map(a => ({
    id: a.id,
    reviewerId: a.reviewer_id,
    reviewerName: `${a.first_name} ${a.last_name}`,
    decision: a.decision,
    note: a.note,
    decidedAt: a.decided_at,
  }));

  return post;
}

async function listPosts({ page = 1, limit = 20, status, teamId, createdBy, search, clientId, socialAccountId }) {
  let where = '1=1';
  const params = [];

  if (status) {
    where += ' AND p.status = ?';
    params.push(status);
  }
  if (teamId) {
    where += ' AND p.team_id = ?';
    params.push(teamId);
  }
  if (createdBy) {
    where += ' AND p.created_by = ?';
    params.push(createdBy);
  }
  if (search) {
    where += ' AND (p.title LIKE ? OR p.content LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  // Filter by social account targeted by the post
  if (socialAccountId) {
    where += ' AND EXISTS (SELECT 1 FROM post_targets pt WHERE pt.post_id = p.id AND pt.social_account_id = ?)';
    params.push(socialAccountId);
  }
  // Filter by client (any of the post's target accounts belongs to that client)
  if (clientId) {
    where += ' AND EXISTS (SELECT 1 FROM post_targets pt JOIN social_accounts sa ON pt.social_account_id = sa.id WHERE pt.post_id = p.id AND sa.client_id = ?)';
    params.push(clientId);
  }

  const offset = (page - 1) * limit;

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) as total FROM posts p WHERE ${where}`,
    params
  );

  const safeLimit = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);
  const [rows] = await pool.execute(
    `SELECT p.*,
            u.first_name AS creator_first_name, u.last_name AS creator_last_name
     FROM posts p
     JOIN users u ON p.created_by = u.id
     WHERE ${where}
     ORDER BY p.created_at DESC
     LIMIT ${safeLimit} OFFSET ${safeOffset}`,
    params
  );

  // Get media for each post (first image only for list view)
  const posts = [];
  for (const row of rows) {
    const post = formatPost(row);
    const [media] = await pool.execute(
      `SELECT m.* FROM media m
       JOIN post_media pm ON m.id = pm.media_id
       WHERE pm.post_id = ?
       ORDER BY pm.sort_order LIMIT 1`,
      [row.id]
    );
    post.thumbnail = media.length > 0
      ? storage.publicUrlFor(media[0].thumbnail_path || media[0].file_path)
      : null;
    post.mediaCount = 0;
    const [mc] = await pool.execute('SELECT COUNT(*) as cnt FROM post_media WHERE post_id = ?', [row.id]);
    post.mediaCount = mc[0].cnt;
    posts.push(post);
  }

  return {
    data: posts,
    pagination: {
      page,
      limit,
      total: countRows[0].total,
      pages: Math.ceil(countRows[0].total / limit),
    },
  };
}

async function updatePost(id, { title, content, postType, assignedTo, teamId, mediaIds, scheduledAt }, userId, userRole) {
  const existing = await getPost(id);

  if (userRole !== 'admin' && userRole !== 'manager' && existing.createdBy !== userId) {
    throw Object.assign(new Error('Not authorized'), { status: 403 });
  }

  if (['published', 'publishing'].includes(existing.status)) {
    throw Object.assign(new Error('Cannot edit a published or publishing post'), { status: 400 });
  }

  const fields = [];
  const values = [];

  if (title !== undefined) { fields.push('title = ?'); values.push(title); }
  if (content !== undefined) {
    fields.push('content = ?'); values.push(content);
    const s = sentiment.analyze(content);
    fields.push('caption_sentiment_score = ?'); values.push(s.comparative);
    fields.push('caption_sentiment_label = ?'); values.push(s.label);
  }
  if (postType !== undefined) { fields.push('post_type = ?'); values.push(postType); }
  if (assignedTo !== undefined) { fields.push('assigned_to = ?'); values.push(assignedTo || null); }
  if (teamId !== undefined) { fields.push('team_id = ?'); values.push(teamId || null); }
  if (scheduledAt !== undefined) {
    fields.push('scheduled_at = ?'); values.push(toMysqlDatetime(scheduledAt));
    fields.push('status = ?'); values.push('scheduled');
  }

  if (fields.length > 0) {
    values.push(id);
    await pool.execute(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`, values);
  }

  // Update media attachments if provided
  if (mediaIds !== undefined) {
    await pool.execute('DELETE FROM post_media WHERE post_id = ?', [id]);
    for (let i = 0; i < mediaIds.length; i++) {
      await pool.execute(
        'INSERT INTO post_media (post_id, media_id, sort_order) VALUES (?, ?, ?)',
        [id, mediaIds[i], i]
      );
    }
    // Update post type based on media
    if (mediaIds.length > 1) {
      await pool.execute("UPDATE posts SET post_type = 'carousel' WHERE id = ?", [id]);
    } else if (mediaIds.length === 1) {
      const [m] = await pool.execute('SELECT mime_type FROM media WHERE id = ?', [mediaIds[0]]);
      if (m.length > 0) {
        const type = m[0].mime_type.startsWith('video/') ? 'video' : 'image';
        await pool.execute('UPDATE posts SET post_type = ? WHERE id = ?', [type, id]);
      }
    }
  }

  return getPost(id);
}

async function deletePost(id, userId, userRole) {
  const post = await getPost(id);

  if (userRole !== 'admin' && userRole !== 'manager' && post.createdBy !== userId) {
    throw Object.assign(new Error('Not authorized'), { status: 403 });
  }

  await pool.execute('DELETE FROM posts WHERE id = ?', [id]);
}

async function submitForApproval(id, userId) {
  const post = await getPost(id);
  if (post.status !== 'draft') {
    throw Object.assign(new Error('Only draft posts can be submitted for approval'), { status: 400 });
  }
  await pool.execute("UPDATE posts SET status = 'pending_approval' WHERE id = ?", [id]);
  await pool.execute(
    "INSERT INTO activity_log (user_id, action, entity_type, entity_id) VALUES (?, 'post.submitted', 'post', ?)",
    [userId, id]
  );
  return getPost(id);
}

async function approvePost(id, reviewerId, note) {
  const post = await getPost(id);
  if (post.status !== 'pending_approval') {
    throw Object.assign(new Error('Post is not pending approval'), { status: 400 });
  }

  await pool.execute("UPDATE posts SET status = 'approved' WHERE id = ?", [id]);
  await pool.execute(
    "INSERT INTO approvals (post_id, reviewer_id, decision, note) VALUES (?, ?, 'approved', ?)",
    [id, reviewerId, note || null]
  );
  await pool.execute(
    "INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, 'post.approved', 'post', ?, ?)",
    [reviewerId, id, JSON.stringify({ note })]
  );

  return getPost(id);
}

async function rejectPost(id, reviewerId, note) {
  const post = await getPost(id);
  if (post.status !== 'pending_approval') {
    throw Object.assign(new Error('Post is not pending approval'), { status: 400 });
  }

  await pool.execute("UPDATE posts SET status = 'draft' WHERE id = ?", [id]);
  await pool.execute(
    "INSERT INTO approvals (post_id, reviewer_id, decision, note) VALUES (?, ?, 'rejected', ?)",
    [id, reviewerId, note || null]
  );
  await pool.execute(
    "INSERT INTO activity_log (user_id, action, entity_type, entity_id, details) VALUES (?, 'post.rejected', 'post', ?, ?)",
    [reviewerId, id, JSON.stringify({ note })]
  );

  return getPost(id);
}

async function schedulePost(id, scheduledAt, userId, userRole) {
  const post = await getPost(id);
  const allowedStatuses = ['draft', 'approved'];
  if (!allowedStatuses.includes(post.status)) {
    throw Object.assign(new Error('Post must be draft or approved to schedule'), { status: 400 });
  }

  await pool.execute(
    "UPDATE posts SET status = 'scheduled', scheduled_at = ? WHERE id = ?",
    [toMysqlDatetime(scheduledAt), id]
  );

  return getPost(id);
}

async function publishNow(id, userId, userRole) {
  const post = await getPost(id);
  const allowedStatuses = ['draft', 'approved', 'scheduled'];
  if (!allowedStatuses.includes(post.status)) {
    throw Object.assign(new Error('Post cannot be published from its current status'), { status: 400 });
  }

  await pool.execute(
    "UPDATE posts SET status = 'scheduled', scheduled_at = NOW() WHERE id = ?",
    [id]
  );

  return getPost(id);
}

async function getStats() {
  const [scheduled] = await pool.execute(
    "SELECT COUNT(*) as cnt FROM posts WHERE status = 'scheduled'"
  );
  const [pending] = await pool.execute(
    "SELECT COUNT(*) as cnt FROM posts WHERE status = 'pending_approval'"
  );
  const [published] = await pool.execute(
    "SELECT COUNT(*) as cnt FROM posts WHERE status = 'published' AND published_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)"
  );

  return {
    scheduled: scheduled[0].cnt,
    pendingApproval: pending[0].cnt,
    publishedThisWeek: published[0].cnt,
  };
}

function formatPost(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content,
    captionSentimentScore: row.caption_sentiment_score != null ? Number(row.caption_sentiment_score) : null,
    captionSentimentLabel: row.caption_sentiment_label || null,
    postType: row.post_type,
    status: row.status,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    publishError: row.publish_error,
    createdBy: row.created_by,
    creatorName: row.creator_first_name ? `${row.creator_first_name} ${row.creator_last_name}` : undefined,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee_first_name ? `${row.assignee_first_name} ${row.assignee_last_name}` : undefined,
    teamId: row.team_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = {
  createPost, getPost, listPosts, updatePost, deletePost,
  submitForApproval, approvePost, rejectPost, schedulePost, publishNow,
  getStats,
};
