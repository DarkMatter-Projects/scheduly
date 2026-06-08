const axios = require('axios');
const pool = require('../config/db');
const yt = require('../config/youtube');
const { encrypt, decrypt } = require('./token.service');
const storage = require('./storage.service');
const logger = require('../utils/logger');

// ── OAuth ─────────────────────────────────────────────────────────────────────

function getAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: yt.clientId,
    redirect_uri: yt.redirectUri,
    scope: yt.YOUTUBE_SCOPES,
    access_type: 'offline',       // gets us a refresh_token
    prompt: 'consent',            // forces consent screen so refresh_token always comes back
    include_granted_scopes: 'true',
    state,
  });
  return `${yt.YOUTUBE_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const form = new URLSearchParams();
  form.append('code', code);
  form.append('client_id', yt.clientId);
  form.append('client_secret', yt.clientSecret);
  form.append('redirect_uri', yt.redirectUri);
  form.append('grant_type', 'authorization_code');

  const { data } = await axios.post(yt.YOUTUBE_TOKEN_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
  };
}

async function refreshAccessToken(refreshTokenPlain) {
  const form = new URLSearchParams();
  form.append('client_id', yt.clientId);
  form.append('client_secret', yt.clientSecret);
  form.append('refresh_token', refreshTokenPlain);
  form.append('grant_type', 'refresh_token');

  const { data } = await axios.post(yt.YOUTUBE_TOKEN_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return { accessToken: data.access_token, expiresIn: data.expires_in };
}

// Pull every channel this Google account manages — content owners often have
// multiple. We store one social_accounts row per channel so the user can pick
// a specific destination on the post composer.
async function fetchChannels(accessToken) {
  const { data } = await axios.get(`${yt.YOUTUBE_API_BASE}/channels`, {
    params: { part: 'snippet,statistics', mine: 'true' },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  return (data.items || []).map(c => ({
    id: c.id,
    title: c.snippet?.title,
    description: c.snippet?.description,
    thumbnailUrl: c.snippet?.thumbnails?.default?.url
                || c.snippet?.thumbnails?.medium?.url
                || null,
    subscriberCount: Number(c.statistics?.subscriberCount) || 0,
    videoCount: Number(c.statistics?.videoCount) || 0,
  }));
}

async function storeAccounts({ tokens, channels, userId, teamId }) {
  const accessExpires = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;
  const refresh = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;
  const access = encrypt(tokens.accessToken);

  const stored = [];
  for (const c of channels) {
    await pool.execute(
      `INSERT INTO social_accounts
         (platform, platform_account_id, account_name, access_token, refresh_token,
          token_expires_at, profile_picture_url, connected_by, team_id)
       VALUES ('youtube', ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         account_name = VALUES(account_name),
         access_token = VALUES(access_token),
         refresh_token = COALESCE(VALUES(refresh_token), refresh_token),
         token_expires_at = VALUES(token_expires_at),
         profile_picture_url = VALUES(profile_picture_url),
         is_active = 1`,
      [c.id, c.title || `YouTube ${c.id.slice(0, 6)}`, access, refresh,
       accessExpires, c.thumbnailUrl || null, userId, teamId || null]
    );
    stored.push({ channelId: c.id, name: c.title });
  }
  return stored;
}

// Auto-refresh access token if it's <5 min from expiry.
async function ensureFreshAccessToken(socialAccountId) {
  const [rows] = await pool.execute(
    'SELECT access_token, refresh_token, token_expires_at FROM social_accounts WHERE id = ?',
    [socialAccountId]
  );
  if (rows.length === 0) throw new Error(`social_account ${socialAccountId} not found`);
  const row = rows[0];

  const expiry = row.token_expires_at ? new Date(row.token_expires_at).getTime() : 0;
  if (row.access_token && Date.now() < expiry - 5 * 60 * 1000) {
    return decrypt(row.access_token);
  }
  if (!row.refresh_token) {
    throw new Error('YouTube access token expired and no refresh token stored — please reconnect.');
  }
  const refreshed = await refreshAccessToken(decrypt(row.refresh_token));
  const newExpiry = new Date(Date.now() + refreshed.expiresIn * 1000);
  await pool.execute(
    'UPDATE social_accounts SET access_token = ?, token_expires_at = ? WHERE id = ?',
    [encrypt(refreshed.accessToken), newExpiry, socialAccountId]
  );
  return refreshed.accessToken;
}

// ── Quota tracking ───────────────────────────────────────────────────────────
//
// YouTube doesn't expose remaining quota via API — you can only see usage
// after the fact in the Google Cloud Console. We track it ourselves by
// counting successful YouTube publishes from post_targets in the rolling
// last 24 hours. One upload costs 1600 units; the daily ceiling defaults
// to 10000 (configurable via YOUTUBE_QUOTA_DAILY env var).
//
// Quota windows are per Google Cloud project (not per channel), so all
// connected YouTube accounts share the same pool.

async function getQuotaStatus() {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS uploads
     FROM post_targets pt
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE sa.platform = 'youtube'
       AND pt.status = 'published'
       AND pt.published_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)`
  );
  const uploadsToday = Number(rows[0]?.uploads) || 0;
  const usedUnits = uploadsToday * yt.QUOTA_COST.videoUpload;
  const remaining = Math.max(0, yt.QUOTA_DAILY_LIMIT - usedUnits);
  const uploadsRemaining = Math.floor(remaining / yt.QUOTA_COST.videoUpload);

  return {
    dailyLimit: yt.QUOTA_DAILY_LIMIT,
    unitsUsed: usedUnits,
    unitsRemaining: remaining,
    uploadsToday,
    uploadsRemaining,
    costPerUpload: yt.QUOTA_COST.videoUpload,
    // Rough estimate of when the rolling window frees up — earliest publish
    // we count is 24h ago, so quota refreshes gradually as those age out.
    nextRefresh: 'rolling 24h window',
  };
}

async function assertQuotaAvailable(neededUploads = 1) {
  const status = await getQuotaStatus();
  if (status.uploadsRemaining < neededUploads) {
    const err = new Error(
      `YouTube daily quota would be exceeded. ${status.uploadsRemaining} uploads remaining of ${Math.floor(status.dailyLimit / status.costPerUpload)} per day.`
    );
    err.code = 'YOUTUBE_QUOTA_EXCEEDED';
    err.status = 429;
    throw err;
  }
  return status;
}

// ── Publishing ───────────────────────────────────────────────────────────────
//
// Resumable upload protocol:
//   1. POST /upload/youtube/v3/videos?uploadType=resumable with metadata
//      → response has `Location` header = the upload session URL
//   2. PUT bytes to that session URL (single shot for files <~256MB; chunked
//      for larger).
//
// Privacy options: 'public' | 'unlisted' | 'private'.
// `madeForKids` is required by COPPA — default false.

async function publishToYouTube(socialAccountId, content, mediaFiles, options = {}) {
  if (!mediaFiles || mediaFiles.length === 0) {
    throw new Error('YouTube requires a video file');
  }
  // Pre-flight quota check — fail fast if there's nothing left in the bucket
  // for today rather than burning the upload retry.
  await assertQuotaAvailable(1);

  const video = mediaFiles.find(m => (m.mimeType || '').startsWith('video/'));
  if (!video) throw new Error('YouTube: no video file in post media');

  const accessToken = await ensureFreshAccessToken(socialAccountId);

  // Step 1: fetch the bytes from R2 / local storage.
  const sourceUrl = publicMediaUrl(video);
  const { data: bytes } = await axios.get(sourceUrl, {
    responseType: 'arraybuffer',
    timeout: 300000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  // Step 2: initiate resumable upload with metadata.
  const title = (options.title || content || 'Untitled').slice(0, 100);
  const description = (content || '').slice(0, 5000);
  const tags = Array.isArray(options.tags) ? options.tags.slice(0, 30) : undefined;
  const privacy = options.privacy || 'private';

  const metadata = {
    snippet: {
      title,
      description,
      ...(tags ? { tags } : {}),
      categoryId: options.categoryId || '22', // 22 = People & Blogs (generic safe default)
    },
    status: {
      privacyStatus: privacy,
      madeForKids: !!options.madeForKids,
      selfDeclaredMadeForKids: !!options.madeForKids,
    },
  };

  const init = await axios.post(
    `${yt.YOUTUBE_UPLOAD_BASE}/videos?uploadType=resumable&part=snippet,status`,
    metadata,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': video.mimeType || 'video/*',
        'X-Upload-Content-Length': String(bytes.length),
      },
      timeout: 30000,
    }
  );

  const uploadUrl = init.headers.location || init.headers.Location;
  if (!uploadUrl) throw new Error('YouTube upload init did not return a session URL');

  // Step 3: PUT the bytes in a single shot.
  const upload = await axios.put(uploadUrl, bytes, {
    headers: {
      'Content-Type': video.mimeType || 'video/*',
      'Content-Length': String(bytes.length),
    },
    timeout: 600000,
    maxBodyLength: Infinity,
  });

  const videoId = upload.data?.id;
  if (!videoId) throw new Error('YouTube returned no video id after upload');
  logger.info(`YouTube video uploaded: ${videoId}`);

  // Custom thumbnail — best-effort. YouTube requires the channel to be
  // verified and supports JPG/PNG up to 2MB; if either constraint fails
  // we log + continue so the video still publishes.
  if (options.customThumbnail) {
    try {
      const thumbUrl = publicMediaUrl(options.customThumbnail);
      const { data: thumbBytes } = await axios.get(thumbUrl, {
        responseType: 'arraybuffer',
        timeout: 60000,
        maxContentLength: 10 * 1024 * 1024,
      });
      await axios.post(
        `${yt.YOUTUBE_UPLOAD_BASE}/thumbnails/set?videoId=${videoId}`,
        thumbBytes,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': options.customThumbnail.mimeType || 'image/jpeg',
            'Content-Length': String(thumbBytes.length),
          },
          timeout: 60000,
          maxBodyLength: Infinity,
        }
      );
      logger.info(`YouTube thumbnail set on ${videoId}`);
    } catch (thumbErr) {
      logger.warn(`YouTube thumbnail set failed on ${videoId}: ${thumbErr.response?.data?.error?.message || thumbErr.message}`);
    }
  }

  return videoId;
}

function publicMediaUrl(media) {
  const url = storage.publicUrlFor(media.filePath);
  if (url && url.startsWith('http')) return url;
  const base = process.env.IG_PUBLIC_BASE_URL || null;
  if (!base) {
    throw new Error('No public URL for media. Configure R2_* env vars so YouTube ingest can fetch the file.');
  }
  return `${base}${url}`;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
  fetchChannels,
  storeAccounts,
  ensureFreshAccessToken,
  getQuotaStatus,
  assertQuotaAvailable,
  publishToYouTube,
};
