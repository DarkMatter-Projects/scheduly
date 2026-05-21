const crypto = require('crypto');
const axios = require('axios');
const pool = require('../config/db');
const env = require('../config/env');
const fb = require('../config/facebook');
const { decrypt } = require('./token.service');
const meta = require('./meta_engage.service');
const engage = require('./engage.service');
const logger = require('../utils/logger');

// ── Signature verification ───────────────────────────────────────────────────

// Meta signs every webhook POST with HMAC SHA-256 of the raw body using the
// app secret. Verify in constant time to avoid timing-based forgery.
function verifySignature(rawBody, signatureHeader) {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;
  const expected = signatureHeader.slice('sha256='.length);
  const hmac = crypto.createHmac('sha256', fb.appSecret).update(rawBody).digest('hex');
  if (expected.length !== hmac.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(hmac, 'hex'));
}

// ── Account lookup helpers ───────────────────────────────────────────────────

async function findFacebookPage(pageId) {
  const [rows] = await pool.execute(
    `SELECT * FROM social_accounts
     WHERE platform = 'facebook_page' AND platform_account_id = ? AND is_active = 1
     LIMIT 1`,
    [pageId]
  );
  return rows[0] || null;
}

async function findInstagramAccount(igUserId) {
  const [rows] = await pool.execute(
    `SELECT * FROM social_accounts
     WHERE platform = 'instagram_business' AND platform_account_id = ? AND is_active = 1
     LIMIT 1`,
    [igUserId]
  );
  return rows[0] || null;
}

// ── Page feed events (comments on FB Page posts) ─────────────────────────────

async function handlePageFeedChange(pageId, value) {
  // We only care about new comments — likes/reactions get logged elsewhere.
  if (value.item !== 'comment' || value.verb !== 'add') return;
  const account = await findFacebookPage(pageId);
  if (!account) {
    logger.debug(`Webhook: feed comment for unknown page ${pageId} — ignoring`);
    return;
  }
  const token = decrypt(account.access_token);

  // Fetch the full comment so we have author + avatar.
  const { data: c } = await axios.get(`${fb.FB_GRAPH_URL}/${value.comment_id}`, {
    params: {
      fields: 'id,from{id,name,picture{url}},message,created_time',
      access_token: token,
    },
  });
  if (!c.from) return;

  // The post the comment is on. `post_id` is "<pageId>_<postId>" in some payloads
  // and bare in others — Graph accepts either form.
  const platformPostId = value.post_id || value.parent_id || null;

  const [tgtRows] = platformPostId
    ? await pool.execute('SELECT id FROM post_targets WHERE platform_post_id = ? LIMIT 1', [platformPostId])
    : [[]];
  const postTargetId = tgtRows[0]?.id || null;

  const threadId = await engage.upsertThread({
    platform: 'facebook_page',
    sourceType: 'comment',
    socialAccountId: account.id,
    postTargetId,
    platformPostId,
    platformPostUrl: platformPostId ? `https://www.facebook.com/${platformPostId}` : null,
    participantId: c.from.id,
    participantName: c.from.name,
    participantAvatarUrl: c.from.picture?.data?.url,
  });
  await engage.upsertIncomingMessage({
    threadId,
    platformMessageId: c.id,
    authorId: c.from.id,
    authorName: c.from.name,
    authorAvatarUrl: c.from.picture?.data?.url,
    body: c.message || '',
    sentAt: new Date(c.created_time),
  });
}

// ── Page messaging events (FB Page DMs) ──────────────────────────────────────

async function handlePageMessaging(pageId, messaging) {
  if (!messaging.message || messaging.message.is_echo) return;
  const account = await findFacebookPage(pageId);
  if (!account) return;
  const token = decrypt(account.access_token);

  const senderId = messaging.sender?.id;
  if (!senderId || senderId === pageId) return;

  // Fetch the sender's name/profile so the thread row reads cleanly.
  let participantName = null;
  let participantAvatarUrl = null;
  try {
    const { data: profile } = await axios.get(`${fb.FB_GRAPH_URL}/${senderId}`, {
      params: { fields: 'name,profile_pic', access_token: token },
    });
    participantName = profile.name;
    participantAvatarUrl = profile.profile_pic;
  } catch (e) {
    // PSID lookup needs pages_messaging + an active 24h window. Not fatal.
  }

  const threadId = await engage.upsertThread({
    platform: 'facebook_page',
    sourceType: 'dm',
    socialAccountId: account.id,
    platformPostId: messaging.message.mid ? null : null, // conversation id not in payload, refetched on next poll
    participantId: senderId,
    participantName,
    participantAvatarUrl,
  });
  await engage.upsertIncomingMessage({
    threadId,
    platformMessageId: messaging.message.mid,
    authorId: senderId,
    authorName: participantName,
    authorAvatarUrl: participantAvatarUrl,
    body: messaging.message.text || '',
    sentAt: new Date(messaging.timestamp || Date.now()),
  });
}

// ── Instagram comments + DMs ─────────────────────────────────────────────────

async function handleInstagramComment(igUserId, value) {
  const account = await findInstagramAccount(igUserId);
  if (!account) return;
  const token = decrypt(account.access_token);

  // Webhook gives us the comment id; refetch for the text + author + media url.
  const { data: c } = await axios.get(`https://graph.instagram.com/${value.id}`, {
    params: { fields: 'id,from,text,timestamp,media{id,permalink}', access_token: token },
  });

  const mediaId = c.media?.id || null;
  const mediaUrl = c.media?.permalink || null;
  const [tgtRows] = mediaId
    ? await pool.execute('SELECT id FROM post_targets WHERE platform_post_id = ? LIMIT 1', [mediaId])
    : [[]];
  const postTargetId = tgtRows[0]?.id || null;

  const authorId = c.from?.id || `anonymous_${c.id}`;
  const authorHandle = c.from?.username || null;

  const threadId = await engage.upsertThread({
    platform: 'instagram_business',
    sourceType: 'comment',
    socialAccountId: account.id,
    postTargetId,
    platformPostId: mediaId,
    platformPostUrl: mediaUrl,
    participantId: authorId,
    participantHandle: authorHandle,
    participantName: authorHandle,
  });
  await engage.upsertIncomingMessage({
    threadId,
    platformMessageId: c.id,
    authorId,
    authorHandle,
    authorName: authorHandle,
    body: c.text || '',
    sentAt: new Date(c.timestamp),
  });
}

async function handleInstagramMessaging(igUserId, messaging) {
  if (!messaging.message || messaging.message.is_echo) return;
  const account = await findInstagramAccount(igUserId);
  if (!account) return;

  const senderId = messaging.sender?.id;
  if (!senderId || senderId === igUserId) return;

  const threadId = await engage.upsertThread({
    platform: 'instagram_business',
    sourceType: 'dm',
    socialAccountId: account.id,
    participantId: senderId,
  });
  await engage.upsertIncomingMessage({
    threadId,
    platformMessageId: messaging.message.mid,
    authorId: senderId,
    body: messaging.message.text || '',
    sentAt: new Date(messaging.timestamp || Date.now()),
  });
}

// ── Top-level dispatcher ─────────────────────────────────────────────────────

// Meta posts both Page + Instagram events to the same webhook with `object`
// distinguishing them. Each entry has either `changes` (object subscriptions
// like feed/comments) or `messaging` (Send/Receive DM events).
async function processWebhookPayload(payload) {
  const entries = payload.entry || [];
  for (const entry of entries) {
    if (payload.object === 'page') {
      for (const change of entry.changes || []) {
        if (change.field === 'feed') {
          await safe(() => handlePageFeedChange(entry.id, change.value), 'page.feed');
        }
      }
      for (const m of entry.messaging || []) {
        await safe(() => handlePageMessaging(entry.id, m), 'page.messaging');
      }
    } else if (payload.object === 'instagram') {
      for (const change of entry.changes || []) {
        if (change.field === 'comments') {
          await safe(() => handleInstagramComment(entry.id, change.value), 'ig.comments');
        }
      }
      for (const m of entry.messaging || []) {
        await safe(() => handleInstagramMessaging(entry.id, m), 'ig.messaging');
      }
    }
  }
}

async function safe(fn, label) {
  try { await fn(); }
  catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    logger.error(`Webhook ${label} failed: ${msg}`);
  }
}

// ── Subscribing a newly-connected Page to webhook fields ─────────────────────

// Called from the FB OAuth callback after we store the Page token. Meta
// requires per-page subscription on top of the app-level subscription set up
// in the Meta dashboard.
async function subscribePageToWebhooks(pageId, pageToken) {
  try {
    await axios.post(`${fb.FB_GRAPH_URL}/${pageId}/subscribed_apps`, null, {
      params: {
        subscribed_fields: 'feed,messages,messaging_postbacks',
        access_token: pageToken,
      },
    });
    logger.info(`Subscribed page ${pageId} to feed + messages webhooks`);
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    logger.warn(`Page ${pageId} webhook subscribe failed: ${msg}`);
  }
}

module.exports = {
  verifySignature,
  processWebhookPayload,
  subscribePageToWebhooks,
};
