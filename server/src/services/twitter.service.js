const axios = require('axios');
const crypto = require('crypto');
const pool = require('../config/db');
const tw = require('../config/twitter');
const { encrypt, decrypt } = require('./token.service');
const logger = require('../utils/logger');

// ── PKCE helpers ──────────────────────────────────────────────────────────────

// X OAuth 2.0 mandates PKCE. We generate a high-entropy verifier per OAuth
// attempt, hash it with SHA-256, and base64url it as the challenge sent on
// the authorize redirect. The verifier is stashed server-side in
// pendingStates so it survives the round trip to X and back.
function generateCodeVerifier() {
  return crypto.randomBytes(64).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function codeChallengeFor(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// ── OAuth ─────────────────────────────────────────────────────────────────────

// Returns both the authorize URL and the PKCE verifier so the controller can
// store the verifier alongside `state` in pendingStates.
function getAuthUrl(state) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = codeChallengeFor(codeVerifier);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: tw.clientId,
    redirect_uri: tw.redirectUri,
    scope: tw.TWITTER_SCOPES,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });
  return {
    authUrl: `${tw.TWITTER_AUTHORIZE_URL}?${params.toString()}`,
    codeVerifier,
  };
}

async function exchangeCodeForToken(code, codeVerifier) {
  const form = new URLSearchParams();
  form.append('grant_type', 'authorization_code');
  form.append('code', code);
  form.append('redirect_uri', tw.redirectUri);
  form.append('client_id', tw.clientId);
  form.append('code_verifier', codeVerifier);

  // X expects Basic auth (client_id:client_secret) for confidential clients.
  const basic = Buffer.from(`${tw.clientId}:${tw.clientSecret}`).toString('base64');
  const { data } = await axios.post(tw.TWITTER_TOKEN_URL, form, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    timeout: 15000,
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in, // usually 7200 (2h)
    scope: data.scope,
    tokenType: data.token_type,
  };
}

async function refreshAccessToken(refreshToken) {
  const form = new URLSearchParams();
  form.append('grant_type', 'refresh_token');
  form.append('refresh_token', refreshToken);
  form.append('client_id', tw.clientId);

  const basic = Buffer.from(`${tw.clientId}:${tw.clientSecret}`).toString('base64');
  const { data } = await axios.post(tw.TWITTER_TOKEN_URL, form, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    timeout: 15000,
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  };
}

// /2/users/me returns id, name, username and any extra fields requested via
// user.fields. profile_image_url comes back at a small size — swap "_normal"
// for "_400x400" so the stored avatar is sharp.
async function fetchUserInfo(accessToken) {
  const { data } = await axios.get(`${tw.TWITTER_API_BASE}/users/me`, {
    params: { 'user.fields': 'id,name,username,profile_image_url,public_metrics' },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });
  return data.data || {};
}

// Persist the X account into social_accounts as platform='twitter'.
async function storeAccount({ tokens, userInfo, userId, teamId }) {
  const accessExpires = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;
  // X refresh tokens don't carry their own expiry header — they rotate on
  // each use and remain valid as long as the user doesn't revoke. We mark
  // them as effectively non-expiring so the token-refresh job leaves them
  // alone until they actually fail.
  const refreshExpires = null;
  const accountName = userInfo.username
    ? `@${userInfo.username}`
    : (userInfo.name || `X ${userInfo.id?.slice(0, 8)}`);
  const avatar = (userInfo.profile_image_url || '').replace('_normal', '_400x400');

  await pool.execute(
    `INSERT INTO social_accounts
       (platform, platform_account_id, account_name, access_token, refresh_token,
        token_expires_at, refresh_token_expires_at, profile_picture_url, connected_by, team_id)
     VALUES ('twitter', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       account_name = VALUES(account_name),
       access_token = VALUES(access_token),
       refresh_token = VALUES(refresh_token),
       token_expires_at = VALUES(token_expires_at),
       refresh_token_expires_at = VALUES(refresh_token_expires_at),
       profile_picture_url = VALUES(profile_picture_url),
       is_active = 1`,
    [
      userInfo.id,
      accountName,
      encrypt(tokens.accessToken),
      tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      accessExpires,
      refreshExpires,
      avatar || null,
      userId,
      teamId || null,
    ]
  );
  return { id: userInfo.id, accountName };
}

// ── Publishing ────────────────────────────────────────────────────────────────

// Post a tweet on behalf of the authenticated user. media support comes
// later — text-only is fine for the initial wire-up. tweets.write scope is
// required.
async function publishTweet(accessToken, text, options = {}) {
  if ((!text || !text.trim()) && !(options.mediaIds && options.mediaIds.length)) {
    throw new Error('Tweet text or media is required');
  }
  const trimmed = (text || '').length > 280 ? text.slice(0, 280) : (text || '');
  const body = { text: trimmed };
  if (options.geoPlaceId) {
    body.geo = { place_id: options.geoPlaceId };
  }
  // X v2 expects media_ids on the `media` block; up to 4 images, 1 GIF
  // or 1 video. We trim to 4 entries to match the upstream limit.
  if (options.mediaIds && options.mediaIds.length > 0) {
    body.media = { media_ids: options.mediaIds.slice(0, 4).map(String) };
  }
  const { data } = await axios.post(`${tw.TWITTER_API_BASE}/tweets`,
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  return data.data?.id;
}

// ── Media upload (chunked v2) ────────────────────────────────────────────────
//
// X exposes an INIT / APPEND / FINALIZE flow on /2/media/upload. We use it
// for every upload regardless of size because (a) videos need it anyway and
// (b) it accepts OAuth 2.0 user-context tokens that we already have, while
// the older v1.1 single-shot path needs OAuth 1.0a.
//
// Returns the media_id_string that publishTweet attaches via media.media_ids.
async function uploadMedia(accessToken, { bytes, mimeType, mediaCategory }) {
  if (!bytes || !bytes.length) throw new Error('uploadMedia: empty buffer');
  const totalBytes = bytes.length;
  const category = mediaCategory || categoryFor(mimeType);

  // 1. INIT — returns the media_id we use for the rest of the dance.
  const initForm = new (require('form-data'))();
  initForm.append('command', 'INIT');
  initForm.append('total_bytes', String(totalBytes));
  initForm.append('media_type', mimeType);
  if (category) initForm.append('media_category', category);
  const { data: initData } = await axios.post(
    `${tw.TWITTER_API_BASE}/media/upload`,
    initForm,
    {
      headers: { Authorization: `Bearer ${accessToken}`, ...initForm.getHeaders() },
      timeout: 30000,
    }
  );
  const mediaId = initData?.data?.id || initData?.media_id_string;
  if (!mediaId) throw new Error('X media INIT returned no media_id');

  // 2. APPEND — push chunks. X recommends <= 5MB per chunk.
  const chunkSize = 4 * 1024 * 1024;
  let segment = 0;
  for (let offset = 0; offset < totalBytes; offset += chunkSize) {
    const chunk = bytes.slice(offset, Math.min(offset + chunkSize, totalBytes));
    const appendForm = new (require('form-data'))();
    appendForm.append('command', 'APPEND');
    appendForm.append('media_id', mediaId);
    appendForm.append('segment_index', String(segment));
    appendForm.append('media', chunk, { filename: `chunk-${segment}`, contentType: 'application/octet-stream' });
    await axios.post(
      `${tw.TWITTER_API_BASE}/media/upload`,
      appendForm,
      {
        headers: { Authorization: `Bearer ${accessToken}`, ...appendForm.getHeaders() },
        timeout: 120000,
        maxBodyLength: Infinity,
      }
    );
    segment++;
  }

  // 3. FINALIZE — X validates the upload and (for videos) starts async processing.
  const finForm = new (require('form-data'))();
  finForm.append('command', 'FINALIZE');
  finForm.append('media_id', mediaId);
  const { data: finData } = await axios.post(
    `${tw.TWITTER_API_BASE}/media/upload`,
    finForm,
    {
      headers: { Authorization: `Bearer ${accessToken}`, ...finForm.getHeaders() },
      timeout: 60000,
    }
  );

  // 4. Optional STATUS poll for videos / gifs.
  let processingInfo = finData?.data?.processing_info || finData?.processing_info;
  let attempts = 0;
  while (processingInfo && processingInfo.state !== 'succeeded') {
    if (processingInfo.state === 'failed') {
      const err = processingInfo.error || {};
      throw new Error(`X media processing failed: ${err.message || err.name || 'unknown'}`);
    }
    if (attempts++ > 30) throw new Error('X media processing timed out');
    const delaySec = Math.max(1, Number(processingInfo.check_after_secs) || 5);
    await new Promise(r => setTimeout(r, delaySec * 1000));
    const { data: statusData } = await axios.get(
      `${tw.TWITTER_API_BASE}/media/upload?command=STATUS&media_id=${mediaId}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 15000 }
    );
    processingInfo = statusData?.data?.processing_info || statusData?.processing_info;
  }

  return mediaId;
}

// X requires media_category for chunked uploads on videos / GIFs. Images
// upload fine without it but supplying it doesn't hurt.
function categoryFor(mime) {
  if (!mime) return null;
  if (mime.startsWith('video/')) return 'tweet_video';
  if (mime === 'image/gif')       return 'tweet_gif';
  if (mime.startsWith('image/'))  return 'tweet_image';
  return null;
}

// Pin or unpin a tweet. X v2 exposes
//   PUT /2/users/:user_id/pinned_tweets   {tweet_id}  (pin)
//   DELETE /2/users/:user_id/pinned_tweets/:tweet_id  (unpin)
// access_token is the OAuth 2.0 user-context token, NOT a bearer.
async function setPinnedTweet(accessToken, userId, tweetId, pinned) {
  if (pinned) {
    const { data } = await axios.post(
      `${tw.TWITTER_API_BASE}/users/${userId}/pinned_tweets`,
      { tweet_id: tweetId },
      { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: 12000 }
    );
    return data?.data?.pinned !== false;
  }
  await axios.delete(
    `${tw.TWITTER_API_BASE}/users/${userId}/pinned_tweets/${tweetId}`,
    { headers: { Authorization: `Bearer ${accessToken}` }, timeout: 12000 }
  );
  return true;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchUserInfo,
  storeAccount,
  publishTweet,
  uploadMedia,
  setPinnedTweet,
};
