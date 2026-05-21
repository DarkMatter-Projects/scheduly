const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const ig = require('../config/instagram');
const { decrypt } = require('./token.service');
const engage = require('./engage.service');
const logger = require('../utils/logger');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getAccount(accountId) {
  const [rows] = await pool.execute('SELECT * FROM social_accounts WHERE id = ?', [accountId]);
  if (rows.length === 0) throw new Error(`social_account ${accountId} not found`);
  return rows[0];
}

function tokenFor(account) {
  return decrypt(account.access_token);
}

// ── Facebook Page: comments on recent posts ──────────────────────────────────

async function ingestFacebookPageComments(account) {
  const token = tokenFor(account);
  const pageId = account.platform_account_id;

  // Pull recent published posts on the page (their own + ours). 25 posts is
  // plenty for a 5-minute poll loop — anything older is unlikely to grow new
  // comments unless something goes viral, in which case the next poll catches up.
  const { data: postsData } = await axios.get(`${fb.FB_GRAPH_URL}/${pageId}/posts`, {
    params: { fields: 'id,created_time', limit: 25, access_token: token },
  });

  let inserted = 0;
  for (const post of postsData.data || []) {
    inserted += await ingestFacebookPostComments(account, token, post.id);
  }
  return inserted;
}

async function ingestFacebookPostComments(account, token, platformPostId) {
  const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${platformPostId}/comments`, {
    params: {
      fields: 'id,from{id,name,picture{url}},message,created_time',
      limit: 50,
      order: 'reverse_chronological',
      access_token: token,
    },
  });

  // Map back to our post_targets row when this is one of ours (so the UI can
  // link the thread to the originating post). Best-effort — not required.
  const [tgtRows] = await pool.execute(
    'SELECT id FROM post_targets WHERE platform_post_id = ? LIMIT 1',
    [platformPostId]
  );
  const postTargetId = tgtRows[0]?.id || null;

  let count = 0;
  for (const c of data.data || []) {
    if (!c.from) continue; // anonymous / hidden authors
    const threadId = await engage.upsertThread({
      platform: 'facebook_page',
      sourceType: 'comment',
      socialAccountId: account.id,
      postTargetId,
      platformPostId,
      participantId: c.from.id,
      participantName: c.from.name,
      participantAvatarUrl: c.from.picture?.data?.url,
    });
    const result = await engage.upsertIncomingMessage({
      threadId,
      platformMessageId: c.id,
      authorId: c.from.id,
      authorName: c.from.name,
      authorAvatarUrl: c.from.picture?.data?.url,
      body: c.message || '',
      sentAt: new Date(c.created_time),
    });
    if (result.isNew) count++;
  }
  return count;
}

// ── Facebook Page: DMs (conversations) ───────────────────────────────────────

async function ingestFacebookPageDMs(account) {
  const token = tokenFor(account);
  const pageId = account.platform_account_id;

  let conversations;
  try {
    const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${pageId}/conversations`, {
      params: {
        fields: 'id,updated_time,participants',
        limit: 25,
        access_token: token,
      },
    });
    conversations = data.data || [];
  } catch (err) {
    if (err.response?.data?.error?.code === 200) {
      logger.warn(`FB DMs skipped for ${account.account_name}: pages_messaging scope missing`);
      return 0;
    }
    throw err;
  }

  let inserted = 0;
  for (const convo of conversations) {
    // Pick the "other side" participant — the one that isn't the page itself.
    const other = (convo.participants?.data || []).find((p) => p.id !== pageId);
    if (!other) continue;

    const threadId = await engage.upsertThread({
      platform: 'facebook_page',
      sourceType: 'dm',
      socialAccountId: account.id,
      platformPostId: convo.id, // store the conversation id here so we can send replies later
      participantId: other.id,
      participantName: other.name,
    });

    // Pull only the last batch of messages — Graph already orders newest-first.
    const { data: msgData } = await axios.get(`${fb.FB_GRAPH_URL}/${convo.id}/messages`, {
      params: {
        fields: 'id,from,to,message,created_time',
        limit: 25,
        access_token: token,
      },
    });

    for (const m of msgData.data || []) {
      const isIncoming = m.from?.id && m.from.id !== pageId;
      if (!isIncoming || !m.message) continue;
      const result = await engage.upsertIncomingMessage({
        threadId,
        platformMessageId: m.id,
        authorId: m.from.id,
        authorName: m.from.name,
        body: m.message,
        sentAt: new Date(m.created_time),
      });
      if (result.isNew) inserted++;
    }
  }
  return inserted;
}

// ── Instagram: comments on recent media ──────────────────────────────────────

async function ingestInstagramComments(account) {
  const token = tokenFor(account);
  const igUserId = account.platform_account_id;

  const { data: mediaData } = await axios.get(`${ig.IG_GRAPH_URL}/${igUserId}/media`, {
    params: { fields: 'id,timestamp', limit: 25, access_token: token },
  });

  let inserted = 0;
  for (const m of mediaData.data || []) {
    inserted += await ingestInstagramMediaComments(account, token, m.id);
  }
  return inserted;
}

async function ingestInstagramMediaComments(account, token, mediaId) {
  let data;
  try {
    const resp = await axios.get(`${ig.IG_GRAPH_URL}/${mediaId}/comments`, {
      params: {
        fields: 'id,from{id,username},text,timestamp',
        limit: 50,
        access_token: token,
      },
    });
    data = resp.data;
  } catch (err) {
    // IG only returns `from` on comments left by Business accounts unless the
    // app has instagram_manage_comments — which our scope set has. If a single
    // media's comments fail, keep going with the others.
    logger.warn(`IG comments skipped for media ${mediaId}: ${err.response?.data?.error?.message || err.message}`);
    return 0;
  }

  const [tgtRows] = await pool.execute(
    'SELECT id FROM post_targets WHERE platform_post_id = ? LIMIT 1',
    [mediaId]
  );
  const postTargetId = tgtRows[0]?.id || null;

  let count = 0;
  for (const c of data.data || []) {
    // Without `from`, IG comments are anonymous from the public Graph view
    // (left by Consumer accounts). Key the thread on the comment id so we
    // still surface the comment in the inbox.
    const authorId = c.from?.id || `anonymous_${c.id}`;
    const authorHandle = c.from?.username || null;

    const threadId = await engage.upsertThread({
      platform: 'instagram_business',
      sourceType: 'comment',
      socialAccountId: account.id,
      postTargetId,
      platformPostId: mediaId,
      participantId: authorId,
      participantHandle: authorHandle,
      participantName: authorHandle,
    });
    const result = await engage.upsertIncomingMessage({
      threadId,
      platformMessageId: c.id,
      authorId,
      authorHandle,
      authorName: authorHandle,
      body: c.text || '',
      sentAt: new Date(c.timestamp),
    });
    if (result.isNew) count++;
  }
  return count;
}

// ── Instagram: DMs ───────────────────────────────────────────────────────────

async function ingestInstagramDMs(account) {
  const token = tokenFor(account);
  const igUserId = account.platform_account_id;

  let conversations;
  try {
    const { data } = await axios.get(`${ig.IG_GRAPH_URL}/${igUserId}/conversations`, {
      params: {
        fields: 'id,updated_time,participants',
        platform: 'instagram',
        limit: 25,
        access_token: token,
      },
    });
    conversations = data.data || [];
  } catch (err) {
    if (err.response?.data?.error?.code === 200 || err.response?.status === 400) {
      logger.warn(`IG DMs skipped for ${account.account_name}: instagram_manage_messages scope missing`);
      return 0;
    }
    throw err;
  }

  let inserted = 0;
  for (const convo of conversations) {
    const other = (convo.participants?.data || []).find((p) => p.id !== igUserId);
    if (!other) continue;

    const threadId = await engage.upsertThread({
      platform: 'instagram_business',
      sourceType: 'dm',
      socialAccountId: account.id,
      platformPostId: convo.id,
      participantId: other.id,
      participantHandle: other.username,
      participantName: other.username,
    });

    const { data: msgData } = await axios.get(`${ig.IG_GRAPH_URL}/${convo.id}/messages`, {
      params: { fields: 'id,from,to,message,created_time', limit: 25, access_token: token },
    });

    for (const m of msgData.data || []) {
      const isIncoming = m.from?.id && m.from.id !== igUserId;
      if (!isIncoming || !m.message) continue;
      const result = await engage.upsertIncomingMessage({
        threadId,
        platformMessageId: m.id,
        authorId: m.from.id,
        authorHandle: m.from.username,
        authorName: m.from.username,
        body: m.message,
        sentAt: new Date(m.created_time),
      });
      if (result.isNew) inserted++;
    }
  }
  return inserted;
}

// ── Reply delivery ───────────────────────────────────────────────────────────

// Reply to a comment thread (FB or IG). Posts the reply as a child comment on
// the same post and returns the new platform_message_id.
async function replyToComment({ thread, body }) {
  const account = await getAccount(thread.social_account_id);
  const token = tokenFor(account);

  // Find the most recent incoming comment on this thread — that's what we're
  // replying to. (Comments are a tree; replying to the comment puts the reply
  // in the correct place.)
  const [rows] = await pool.execute(
    `SELECT platform_message_id FROM engage_messages
     WHERE thread_id = ? AND direction = 'incoming' AND platform_message_id IS NOT NULL
     ORDER BY sent_at DESC LIMIT 1`,
    [thread.id]
  );
  const parentCommentId = rows[0]?.platform_message_id;
  if (!parentCommentId) throw new Error('Cannot reply: original comment id missing');

  const base = thread.platform === 'instagram_business' ? ig.IG_GRAPH_URL : fb.FB_GRAPH_URL;
  const messageField = thread.platform === 'instagram_business' ? 'message' : 'message';

  const { data } = await axios.post(`${base}/${parentCommentId}/comments`, null, {
    params: { [messageField]: body, access_token: token },
  });
  return data.id;
}

async function replyToFacebookDM({ thread, body }) {
  const account = await getAccount(thread.social_account_id);
  const token = tokenFor(account);

  // For DMs, Meta's Send API takes a recipient by PSID (the participant_id we
  // stored on the thread). The page must have an active 24-hour messaging
  // window with the user (standard messaging policy).
  const { data } = await axios.post(`${fb.FB_GRAPH_URL}/me/messages`, {
    recipient: { id: thread.participant_id },
    message: { text: body },
    messaging_type: 'RESPONSE',
  }, {
    params: { access_token: token },
  });
  return data.message_id;
}

async function replyToInstagramDM({ thread, body }) {
  const account = await getAccount(thread.social_account_id);
  const token = tokenFor(account);

  // IG Direct uses the same /me/messages shape on the Graph API, but the
  // recipient is the IGSID (participant_id from the conversation).
  const { data } = await axios.post(`${ig.IG_GRAPH_URL}/${account.platform_account_id}/messages`, {
    recipient: { id: thread.participant_id },
    message: { text: body },
  }, {
    params: { access_token: token },
  });
  return data.message_id;
}

async function sendReply({ thread, body }) {
  if (thread.source_type === 'comment') {
    return { platformMessageId: await replyToComment({ thread, body }) };
  }
  if (thread.source_type === 'dm' && thread.platform === 'facebook_page') {
    return { platformMessageId: await replyToFacebookDM({ thread, body }) };
  }
  if (thread.source_type === 'dm' && thread.platform === 'instagram_business') {
    return { platformMessageId: await replyToInstagramDM({ thread, body }) };
  }
  throw new Error(`Reply not supported for ${thread.platform}/${thread.source_type}`);
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

async function ingestAllForAccount(account) {
  const stats = { comments: 0, dms: 0, errors: [] };
  const tasks = [];

  if (account.platform === 'facebook_page') {
    tasks.push(['comments', () => ingestFacebookPageComments(account)]);
    tasks.push(['dms', () => ingestFacebookPageDMs(account)]);
  } else if (account.platform === 'instagram_business') {
    tasks.push(['comments', () => ingestInstagramComments(account)]);
    tasks.push(['dms', () => ingestInstagramDMs(account)]);
  }

  for (const [key, fn] of tasks) {
    try {
      stats[key] += await fn();
    } catch (err) {
      const msg = err.response?.data?.error?.message || err.message;
      logger.error(`Engage ingest ${account.platform}:${key} for ${account.account_name} — ${msg}`);
      stats.errors.push(`${key}: ${msg}`);
    }
  }
  return stats;
}

module.exports = {
  ingestFacebookPageComments,
  ingestFacebookPageDMs,
  ingestInstagramComments,
  ingestInstagramDMs,
  ingestAllForAccount,
  sendReply,
};
