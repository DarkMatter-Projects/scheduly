const crypto = require('crypto');
const pool = require('../config/db');
const notifications = require('./notifications.service');

// Generate a public approval link for a post. Anyone with the URL can
// approve / reject — that's the point. They identify themselves with
// a name + email at decision time, which we record on the row so the
// audit trail isn't anonymous.
async function createApprovalToken({ postId, expiresInDays, createdBy }) {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = expiresInDays && Number(expiresInDays) > 0
    ? new Date(Date.now() + Number(expiresInDays) * 86400000)
    : null;
  await pool.execute(
    `INSERT INTO post_approval_tokens (post_id, token, created_by, expires_at)
     VALUES (?, ?, ?, ?)`,
    [postId, token, createdBy, expiresAt]
  );
  return { token, expiresAt };
}

async function listTokensForPost(postId) {
  const [rows] = await pool.execute(
    `SELECT * FROM post_approval_tokens
     WHERE post_id = ?
     ORDER BY created_at DESC`,
    [postId]
  );
  return rows.map(format);
}

async function revokeToken(id) {
  await pool.execute('DELETE FROM post_approval_tokens WHERE id = ?', [id]);
}

// Public lookup — fetches the post preview + token metadata for the
// approver. Filters out write-only / internal fields so the brand
// stakeholder doesn't accidentally see things like team_id.
async function resolveToken(token) {
  const [rows] = await pool.execute(
    `SELECT t.*, p.title AS post_title, p.content AS post_content,
            p.status AS post_status, p.scheduled_at AS post_scheduled_at,
            p.post_type AS post_type
     FROM post_approval_tokens t
     JOIN posts p ON t.post_id = p.id
     WHERE t.token = ?`,
    [token]
  );
  if (rows.length === 0) return null;
  const row = rows[0];
  if (row.expires_at && new Date(row.expires_at) < new Date()) return { expired: true };

  // Pull a few thumbnails so the approver can see what's being posted.
  const [media] = await pool.execute(
    `SELECT m.id, m.file_path, m.thumbnail_path, m.mime_type, m.original_name
     FROM media m
     JOIN post_media pm ON m.id = pm.media_id
     WHERE pm.post_id = ?
     ORDER BY pm.sort_order`,
    [row.post_id]
  );
  // And the target social account list — what platforms / accounts
  // the post will fan out to once approved.
  const [targets] = await pool.execute(
    `SELECT sa.platform, sa.account_name, sa.profile_picture_url
     FROM post_targets pt
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE pt.post_id = ?`,
    [row.post_id]
  );

  return {
    token: row.token,
    post: {
      id: row.post_id,
      title: row.post_title,
      content: row.post_content,
      status: row.post_status,
      scheduledAt: row.post_scheduled_at,
      postType: row.post_type,
      media: media.map(m => ({
        id: m.id,
        url: m.file_path,
        thumbnailUrl: m.thumbnail_path,
        mimeType: m.mime_type,
        originalName: m.original_name,
      })),
      targets: targets.map(t => ({
        platform: t.platform,
        accountName: t.account_name,
        profilePictureUrl: t.profile_picture_url,
      })),
    },
    decision: row.decision,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    reviewerName: row.reviewer_name,
    expiresAt: row.expires_at,
  };
}

// Brand stakeholder submits their decision. We record name + email
// for the audit log, then route into the existing post approval flow
// (approvePost / rejectPost) so notifications + activity_log fire.
async function recordDecision({ token, decision, reviewerName, reviewerEmail, note }) {
  if (!['approved', 'rejected'].includes(decision)) {
    throw Object.assign(new Error('decision must be approved or rejected'), { status: 400 });
  }
  if (!reviewerName) {
    throw Object.assign(new Error('reviewer name is required'), { status: 400 });
  }
  const [rows] = await pool.execute(
    `SELECT t.*, p.status AS post_status, p.created_by AS post_creator_id
     FROM post_approval_tokens t
     JOIN posts p ON t.post_id = p.id
     WHERE t.token = ?`,
    [token]
  );
  if (rows.length === 0) throw Object.assign(new Error('Token not found'), { status: 404 });
  const row = rows[0];
  if (row.decision) {
    throw Object.assign(new Error('This link has already been used'), { status: 400 });
  }
  if (row.expires_at && new Date(row.expires_at) < new Date()) {
    throw Object.assign(new Error('This link has expired'), { status: 400 });
  }

  await pool.execute(
    `UPDATE post_approval_tokens
     SET decision = ?, decision_note = ?, reviewer_name = ?, reviewer_email = ?, decided_at = NOW()
     WHERE id = ?`,
    [decision, note || null, reviewerName.slice(0, 150), (reviewerEmail || '').slice(0, 255) || null, row.id]
  );

  // Move the post itself through the existing approval state machine
  // so the activity log + notifications stay coherent. If the post
  // isn't currently pending_approval (e.g. someone submitted, then
  // shared the link, then unsubmitted), force it back to pending so
  // approvePost works, then flip.
  const postService = require('./post.service');
  if (row.post_status !== 'pending_approval') {
    await pool.execute(`UPDATE posts SET status = 'pending_approval' WHERE id = ?`, [row.post_id]);
  }
  const reviewerLabel = `${reviewerName} (client sign-off)`;
  try {
    if (decision === 'approved') {
      // Reuse approvePost but feed it the token creator as the user
      // (we don't have a user_id for the brand stakeholder). The note
      // captures who actually clicked.
      await postService.approvePost(row.post_id, row.created_by, `${reviewerLabel}: ${note || 'approved'}`);
    } else {
      await postService.rejectPost(row.post_id, row.created_by, `${reviewerLabel}: ${note || 'rejected'}`);
    }
  } catch (err) {
    // approvePost / rejectPost throw if the state doesn't match. We
    // already wrote our token row + audit info; surface the underlying
    // error rather than swallowing it.
    throw err;
  }

  // Fire a notification to the original creator that the client signed off.
  try {
    await notifications.notify({
      type: decision === 'approved' ? 'post_approved' : 'post_rejected',
      severity: decision === 'approved' ? 'info' : 'warning',
      targetUserId: row.post_creator_id,
      title: decision === 'approved' ? 'Client approved your post' : 'Client sent your post back',
      body: `${reviewerName}${note ? `: ${note.slice(0, 160)}` : ''}`,
      link: `/posts/${row.post_id}`,
      payload: { postId: row.post_id, reviewerName, reviewerEmail, note, via: 'client_sign_off' },
    });
  } catch { /* best-effort */ }

  return { ok: true, decision };
}

function format(row) {
  return {
    id: row.id,
    postId: row.post_id,
    token: row.token,
    reviewerName: row.reviewer_name,
    reviewerEmail: row.reviewer_email,
    decision: row.decision,
    decisionNote: row.decision_note,
    decidedAt: row.decided_at,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

module.exports = {
  createApprovalToken, listTokensForPost, revokeToken,
  resolveToken, recordDecision,
};
