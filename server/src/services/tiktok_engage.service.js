const axios = require('axios');
const pool = require('../config/db');
const tt = require('../config/tiktok_login');
const { ensureFreshAccessToken } = require('./tiktok_posting.service');
const engage = require('./engage.service');
const logger = require('../utils/logger');

// TikTok's comment endpoints require comment.list (read) and comment.create
// (reply). Both are gated behind app review — until they're approved the API
// returns scope_not_authorized and we log + skip gracefully.

async function listOwnVideos(accessToken) {
  const fields = 'id,create_time,title';
  const { data } = await axios.post(
    `${tt.TIKTOK_API_BASE}/video/list/?fields=${fields}`,
    { max_count: 20 },
    {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      timeout: 15000,
    }
  );
  if (data.error && data.error.code !== 'ok') {
    throw Object.assign(new Error(data.error.message || data.error.code), { code: data.error.code });
  }
  return data.data?.videos || [];
}

async function listCommentsForVideo(accessToken, videoId) {
  const { data } = await axios.post(
    `${tt.TIKTOK_API_BASE}/comment/list/`,
    { video_id: String(videoId), max_count: 50 },
    {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      timeout: 15000,
    }
  );
  if (data.error && data.error.code !== 'ok') {
    throw Object.assign(new Error(data.error.message || data.error.code), { code: data.error.code });
  }
  return data.data?.comments || [];
}

async function ingestTikTokComments(account) {
  const accessToken = await ensureFreshAccessToken(account.id);

  let videos;
  try {
    videos = await listOwnVideos(accessToken);
  } catch (err) {
    if (err.code === 'scope_not_authorized') {
      logger.warn(`TikTok comments skipped for ${account.account_name}: video.list scope missing`);
      return 0;
    }
    throw err;
  }

  let inserted = 0;
  for (const v of videos) {
    let comments;
    try {
      comments = await listCommentsForVideo(accessToken, v.id);
    } catch (err) {
      if (err.code === 'scope_not_authorized') {
        logger.warn(`TikTok comments skipped: comment.list scope missing (account ${account.account_name})`);
        return inserted;
      }
      logger.warn(`TikTok comment.list failed for video ${v.id}: ${err.message}`);
      continue;
    }

    const [tgtRows] = await pool.execute(
      'SELECT id FROM post_targets WHERE platform_post_id = ? LIMIT 1',
      [String(v.id)]
    );
    const postTargetId = tgtRows[0]?.id || null;

    for (const c of comments) {
      const participantId = c.user?.open_id || c.user_id || `anonymous_${c.id}`;
      const handle = c.user?.display_name || null;

      const threadId = await engage.upsertThread({
        platform: 'tiktok',
        sourceType: 'comment',
        socialAccountId: account.id,
        postTargetId,
        platformPostId: String(v.id),
        participantId,
        participantHandle: handle,
        participantName: handle,
        participantAvatarUrl: c.user?.avatar_url || null,
      });
      const result = await engage.upsertIncomingMessage({
        threadId,
        platformMessageId: String(c.id),
        authorId: participantId,
        authorHandle: handle,
        authorName: handle,
        authorAvatarUrl: c.user?.avatar_url || null,
        body: c.text || '',
        sentAt: c.create_time ? new Date(c.create_time * 1000) : new Date(),
      });
      if (result.isNew) inserted++;
    }
  }
  return inserted;
}

async function replyToTikTokComment({ thread, body }) {
  const accessToken = await ensureFreshAccessToken(thread.social_account_id);

  const [rows] = await pool.execute(
    `SELECT platform_message_id FROM engage_messages
     WHERE thread_id = ? AND direction = 'incoming' AND platform_message_id IS NOT NULL
     ORDER BY sent_at DESC LIMIT 1`,
    [thread.id]
  );
  const parentCommentId = rows[0]?.platform_message_id;
  if (!parentCommentId) throw new Error('Cannot reply: original comment id missing');

  const { data } = await axios.post(
    `${tt.TIKTOK_API_BASE}/comment/reply/create/`,
    {
      video_id: String(thread.platform_post_id),
      comment_id: parentCommentId,
      text: body,
    },
    {
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json; charset=UTF-8' },
      timeout: 15000,
    }
  );
  if (data.error && data.error.code !== 'ok') {
    throw new Error(data.error.message || data.error.code);
  }
  return data.data?.comment?.id || null;
}

module.exports = {
  ingestTikTokComments,
  replyToTikTokComment,
};
