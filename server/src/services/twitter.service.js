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
async function publishTweet(accessToken, text) {
  if (!text || !text.trim()) throw new Error('Tweet text is required');
  const trimmed = text.length > 280 ? text.slice(0, 280) : text;
  const { data } = await axios.post(`${tw.TWITTER_API_BASE}/tweets`,
    { text: trimmed },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  // Response shape: { data: { id, edit_history_tweet_ids: [...], text } }
  return data.data?.id;
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
  setPinnedTweet,
};
