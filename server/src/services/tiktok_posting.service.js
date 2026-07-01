const axios = require('axios');
const pool = require('../config/db');
const tt = require('../config/tiktok_login');
const { encrypt, decrypt } = require('./token.service');
const logger = require('../utils/logger');
const storage = require('./storage.service');

// ── OAuth ─────────────────────────────────────────────────────────────────────

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_key: tt.clientKey,
    response_type: 'code',
    scope: tt.TIKTOK_SCOPES,
    redirect_uri: tt.redirectUri,
    state,
  });
  return `${tt.TIKTOK_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  // TikTok wants form-encoded body, not JSON.
  const form = new URLSearchParams();
  form.append('client_key', tt.clientKey);
  form.append('client_secret', tt.clientSecret);
  form.append('code', code);
  form.append('grant_type', 'authorization_code');
  form.append('redirect_uri', tt.redirectUri);

  const { data } = await axios.post(tt.TIKTOK_TOKEN_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  if (data.error) {
    throw new Error(`TikTok token exchange failed: ${data.error_description || data.error}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,                   // seconds, typically 86400 (24h)
    refreshExpiresIn: data.refresh_expires_in,    // seconds, typically 31536000 (1y)
    openId: data.open_id,
    scope: data.scope,
  };
}

async function refreshAccessToken(refreshTokenPlain) {
  const form = new URLSearchParams();
  form.append('client_key', tt.clientKey);
  form.append('client_secret', tt.clientSecret);
  form.append('grant_type', 'refresh_token');
  form.append('refresh_token', refreshTokenPlain);

  const { data } = await axios.post(tt.TIKTOK_TOKEN_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  if (data.error) {
    throw new Error(`TikTok token refresh failed: ${data.error_description || data.error}`);
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    refreshExpiresIn: data.refresh_expires_in,
  };
}

async function fetchUserInfo(accessToken) {
  // Stay within user.info.basic — `username` requires user.info.profile and
  // would 401 with scope_not_authorized when we don't request that scope.
  const fields = 'open_id,union_id,avatar_url,display_name';
  const { data } = await axios.get(`${tt.TIKTOK_API_BASE}/user/info/?fields=${fields}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok user/info failed: ${data.error.message || data.error.code}`);
  }
  return data.data?.user || {};
}

// Persist the TikTok account into social_accounts as platform='tiktok'.
async function storeAccount({ tokens, userInfo, userId, teamId }) {
  const accessExpires = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;
  const refreshExpires = tokens.refreshExpiresIn ? new Date(Date.now() + tokens.refreshExpiresIn * 1000) : null;
  // display_name is what user.info.basic returns; username would need profile scope.
  const accountName = userInfo.display_name
    || `TikTok ${tokens.openId.slice(0, 8)}`;

  await pool.execute(
    `INSERT INTO social_accounts
       (platform, platform_account_id, account_name, access_token, refresh_token,
        token_expires_at, refresh_token_expires_at, profile_picture_url, connected_by, team_id)
     VALUES ('tiktok', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       account_name = VALUES(account_name),
       access_token = VALUES(access_token),
       refresh_token = VALUES(refresh_token),
       token_expires_at = VALUES(token_expires_at),
       refresh_token_expires_at = VALUES(refresh_token_expires_at),
       profile_picture_url = VALUES(profile_picture_url),
       is_active = 1`,
    [
      tokens.openId,
      accountName,
      encrypt(tokens.accessToken),
      tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      accessExpires,
      refreshExpires,
      userInfo.avatar_url || null,
      userId,
      teamId || null,
    ]
  );

  return { openId: tokens.openId, accountName };
}

// Refresh if the access token is missing or within 5 min of expiry.
async function ensureFreshAccessToken(socialAccountId) {
  const [rows] = await pool.execute(
    'SELECT id, access_token, refresh_token, token_expires_at FROM social_accounts WHERE id = ?',
    [socialAccountId]
  );
  if (rows.length === 0) throw new Error(`social_account ${socialAccountId} not found`);
  const row = rows[0];

  const expiry = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (row.access_token && Date.now() < expiry - 5 * 60 * 1000) {
    return decrypt(row.access_token);
  }
  if (!row.refresh_token) {
    throw new Error('TikTok access token expired and no refresh token stored — please reconnect.');
  }

  const refreshed = await refreshAccessToken(decrypt(row.refresh_token));
  const newAccessExpiry = new Date(Date.now() + refreshed.expiresIn * 1000);
  const newRefreshExpiry = refreshed.refreshExpiresIn
    ? new Date(Date.now() + refreshed.refreshExpiresIn * 1000)
    : null;
  await pool.execute(
    `UPDATE social_accounts
       SET access_token = ?, refresh_token = ?,
           token_expires_at = ?, refresh_token_expires_at = ?
       WHERE id = ?`,
    [
      encrypt(refreshed.accessToken),
      refreshed.refreshToken ? encrypt(refreshed.refreshToken) : decrypt(row.refresh_token),
      newAccessExpiry,
      newRefreshExpiry || row.refresh_token_expires_at,
      socialAccountId,
    ]
  );
  return refreshed.accessToken;
}

// ── Publishing ────────────────────────────────────────────────────────────────

// Build a public URL for a media row. R2 returns absolute, otherwise we need
// a configured public base. TikTok needs publicly fetchable URLs that match
// the verified URL prefix in the developer app.
function publicMediaUrl(media, publicBaseUrl) {
  const url = storage.publicUrlFor(media.filePath);
  if (url && url.startsWith('http')) return url;
  if (!publicBaseUrl) {
    throw new Error('No public URL for media. Set R2_* env vars so TikTok can fetch the media.');
  }
  return `${publicBaseUrl}${url}`;
}

// Query the creator's allowed posting capabilities. Required by TikTok before
// initiating a Direct Post (per their docs). We don't strictly need it for
// Inbox mode, but calling it lets us surface "private account → no public
// post" issues with a clear message.
async function queryCreatorInfo(accessToken) {
  const { data } = await axios.post(
    `${tt.TIKTOK_API_BASE}/post/publish/creator_info/query/`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      timeout: 15000,
    }
  );
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok creator_info failed: ${data.error.message || data.error.code}`);
  }
  return data.data || {};
}

// Single entry point used by publisher.service.js
//   options: { mode: 'DIRECT_POST' | 'INBOX', privacyLevel, disableComment, disableDuet, disableStitch }
async function publishToTikTok(socialAccountId, content, mediaFiles, options = {}) {
  if (!mediaFiles || mediaFiles.length === 0) {
    throw new Error('TikTok requires at least one image or video');
  }
  const accessToken = await ensureFreshAccessToken(socialAccountId);

  const allVideos = mediaFiles.every(m => m.mimeType.startsWith('video/'));
  const allImages = mediaFiles.every(m => m.mimeType.startsWith('image/'));
  if (!allVideos && !allImages) {
    throw new Error('TikTok posts must be either all video or all images, not mixed.');
  }
  if (allVideos && mediaFiles.length > 1) {
    throw new Error('TikTok video posts must contain a single video file.');
  }

  const mode = options.mode || 'INBOX';
  const privacyLevel = options.privacyLevel || 'SELF_ONLY';
  const publicBaseUrl = process.env.IG_PUBLIC_BASE_URL || null;

  if (allVideos) {
    return publishVideo(accessToken, content, mediaFiles[0], publicBaseUrl, { ...options, mode, privacyLevel });
  }
  return publishPhotos(accessToken, content, mediaFiles, publicBaseUrl, { ...options, mode, privacyLevel });
}

async function publishVideo(accessToken, caption, media, publicBaseUrl, opts) {
  const videoUrl = publicMediaUrl(media, publicBaseUrl);
  const endpoint = opts.mode === 'INBOX'
    ? `${tt.TIKTOK_API_BASE}/post/publish/inbox/video/init/`
    : `${tt.TIKTOK_API_BASE}/post/publish/video/init/`;

  const body = opts.mode === 'INBOX'
    ? { source_info: { source: 'PULL_FROM_URL', video_url: videoUrl } }
    : {
        post_info: {
          title: caption || '',
          privacy_level: opts.privacyLevel,
          disable_comment: !!opts.disableComment,
          disable_duet: !!opts.disableDuet,
          disable_stitch: !!opts.disableStitch,
          video_cover_timestamp_ms: 1000,
          // TikTok Content Sharing Guidelines § 3 — commercial disclosure.
          brand_content_toggle: !!opts.brandContentToggle,
          brand_organic_toggle: !!opts.brandOrganicToggle,
        },
        source_info: { source: 'PULL_FROM_URL', video_url: videoUrl },
      };

  const { data } = await axios.post(endpoint, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    timeout: 30000,
  });
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok video init failed: ${data.error.message || data.error.code}`);
  }
  const publishId = data.data?.publish_id;
  if (!publishId) throw new Error('TikTok video init returned no publish_id');
  logger.info(`TikTok video publish initiated (publish_id=${publishId}, mode=${opts.mode})`);
  return publishId;
}

async function publishPhotos(accessToken, caption, mediaFiles, publicBaseUrl, opts) {
  const photoUrls = mediaFiles.map(m => publicMediaUrl(m, publicBaseUrl));
  const endpoint = `${tt.TIKTOK_API_BASE}/post/publish/content/init/`;

  // For photo content, TikTok wants media_type + post_mode at the top level
  // of the body — NOT inside source_info. Posting them inside source_info
  // returns "Invalid media_type or post_mode" with code=invalid_params.
  const body = {
    media_type: 'PHOTO',
    post_mode: opts.mode === 'INBOX' ? 'MEDIA_UPLOAD' : 'DIRECT_POST',
    post_info: {
      title: caption || '',
      privacy_level: opts.privacyLevel,
      disable_comment: !!opts.disableComment,
      auto_add_music: true,
    },
    source_info: {
      source: 'PULL_FROM_URL',
      photo_cover_index: 0,
      photo_images: photoUrls,
    },
  };

  const { data } = await axios.post(endpoint, body, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    timeout: 30000,
  });
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok photo init failed: ${data.error.message || data.error.code}`);
  }
  const publishId = data.data?.publish_id;
  if (!publishId) throw new Error('TikTok photo init returned no publish_id');
  logger.info(`TikTok photo publish initiated (publish_id=${publishId}, count=${photoUrls.length}, mode=${opts.mode})`);
  return publishId;
}

// Reads insights for a public TikTok video the user owns. Requires the
// `video.list` scope on the OAuth grant; will 401 with scope_not_authorized
// if the user connected before that scope was added (re-OAuth fixes it).
async function fetchVideoInsights(socialAccountId, publicVideoId) {
  const accessToken = await ensureFreshAccessToken(socialAccountId);
  const fields = 'id,view_count,like_count,comment_count,share_count';
  const { data } = await axios.post(
    `${tt.TIKTOK_API_BASE}/video/query/?fields=${fields}`,
    { filters: { video_ids: [String(publicVideoId)] } },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      timeout: 15000,
    }
  );
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok video query failed: ${data.error.message || data.error.code}`);
  }
  return (data.data?.videos || [])[0] || null;
}

// Poll the publish status. For PULL_FROM_URL flows we don't block on this
// during the publish job — we record the publish_id and let it process
// asynchronously. Callers can poll if they want the final platform_post_id.
async function getPublishStatus(accessToken, publishId) {
  const { data } = await axios.post(
    `${tt.TIKTOK_API_BASE}/post/publish/status/fetch/`,
    { publish_id: publishId },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      timeout: 15000,
    }
  );
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok status check failed: ${data.error.message || data.error.code}`);
  }
  return data.data || {};
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchUserInfo,
  storeAccount,
  ensureFreshAccessToken,
  queryCreatorInfo,
  publishToTikTok,
  getPublishStatus,
  fetchVideoInsights,
};
