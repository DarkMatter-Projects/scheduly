const axios = require('axios');
const pool = require('../config/db');
const ig = require('../config/instagram');
const { encrypt, decrypt } = require('./token.service');
const storage = require('./storage.service');
const logger = require('../utils/logger');

// Build the public URL Meta will fetch. R2 returns an absolute Cloudflare URL;
// otherwise we fall back to publicBaseUrl + /uploads/...
function publicMediaUrl(media, publicBaseUrl) {
  const url = storage.publicUrlFor(media.filePath);
  if (url && url.startsWith('http')) return url; // R2 absolute URL
  if (!publicBaseUrl) {
    throw new Error(
      'No public URL for media. Configure R2_* env vars or set IG_PUBLIC_BASE_URL.'
    );
  }
  return `${publicBaseUrl}${url}`;
}

// ── OAuth Flow (Instagram Business Login - direct, no Facebook Page needed) ──

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: ig.appId,
    redirect_uri: ig.redirectUri,
    response_type: 'code',
    scope: ig.IG_SCOPES,
    state,
  });
  return `${ig.IG_OAUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const formData = new URLSearchParams();
  formData.append('client_id', ig.appId);
  formData.append('client_secret', ig.appSecret);
  formData.append('grant_type', 'authorization_code');
  formData.append('redirect_uri', ig.redirectUri);
  formData.append('code', code);

  const { data } = await axios.post(ig.IG_TOKEN_URL, formData, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });

  return {
    accessToken: data.access_token,
    userId: data.user_id,
  };
}

async function exchangeForLongLivedToken(shortLivedToken) {
  const { data } = await axios.get(`${ig.IG_GRAPH_URL}/access_token`, {
    params: {
      grant_type: 'ig_exchange_token',
      client_secret: ig.appSecret,
      access_token: shortLivedToken,
    },
  });

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in, // ~60 days
  };
}

async function refreshLongLivedToken(encryptedToken) {
  const token = decrypt(encryptedToken);
  const { data } = await axios.get(`${ig.IG_GRAPH_URL}/refresh_access_token`, {
    params: {
      grant_type: 'ig_refresh_token',
      access_token: token,
    },
  });

  return {
    accessToken: encrypt(data.access_token),
    expiresIn: data.expires_in,
  };
}

async function fetchInstagramAccount(accessToken, userId, connectedBy, teamId) {
  const { data: profile } = await axios.get(`${ig.IG_GRAPH_URL}/${userId}`, {
    params: {
      fields: 'id,username,name,account_type,profile_picture_url',
      access_token: accessToken,
    },
  });

  const encryptedToken = encrypt(accessToken);
  const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000); // 60 days

  await pool.execute(
    `INSERT INTO social_accounts (platform, platform_account_id, account_name, access_token, token_expires_at, profile_picture_url, connected_by, team_id)
     VALUES ('instagram_business', ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), token_expires_at = VALUES(token_expires_at), account_name = VALUES(account_name), profile_picture_url = VALUES(profile_picture_url), is_active = 1`,
    [
      profile.id,
      profile.username || profile.name || `IG @${profile.id}`,
      encryptedToken,
      tokenExpiresAt,
      profile.profile_picture_url || null,
      connectedBy,
      teamId || null,
    ]
  );

  return {
    platform: 'instagram_business',
    id: profile.id,
    name: profile.username,
  };
}

// ── Publishing ──

/**
 * Publishes content to Instagram via the direct Instagram API.
 * Note: Instagram still requires media to be accessible via a public URL.
 */
async function publishToInstagram(igAccountId, encryptedToken, content, mediaFiles, publicBaseUrl, options = {}) {
  const token = decrypt(encryptedToken);

  if (!mediaFiles || mediaFiles.length === 0) {
    throw new Error('Instagram requires at least one image or video');
  }

  // Diagnostic: confirm the token works and the account is publishing-eligible
  try {
    const { data: profile } = await axios.get(`${ig.IG_GRAPH_URL}/${igAccountId}`, {
      params: { fields: 'id,username,account_type,name', access_token: token },
    });
    logger.info(`IG publish: token works for ${profile.username} (${profile.account_type})`, profile);
  } catch (e) {
    logger.error(`IG publish: token check FAILED — ${e.response?.data?.error?.message || e.message}`, {
      status: e.response?.status,
      response: e.response?.data,
    });
  }

  // Stories — single image OR single video, posted as a 24h story
  // instead of a feed post. IG container accepts the same image_url /
  // video_url, but media_type must be STORIES and we skip the
  // carousel / collaborator / first-comment plumbing (Stories don't
  // support those).
  if (options.publishAsStory) {
    if (mediaFiles.length !== 1) {
      throw new Error('Instagram Stories must contain exactly one image or video');
    }
    return publishStory(igAccountId, token, mediaFiles[0], publicBaseUrl);
  }

  if (mediaFiles.length === 1) {
    return publishSingleMedia(igAccountId, token, content, mediaFiles[0], publicBaseUrl, options);
  }

  return publishCarousel(igAccountId, token, content, mediaFiles, publicBaseUrl, options);
}

// Story container — media_type=STORIES on /me/media, then media_publish.
async function publishStory(igAccountId, token, media, publicBaseUrl) {
  const isVideo = (media.mimeType || '').startsWith('video/');
  const mediaUrl = publicMediaUrl(media, publicBaseUrl);
  const params = {
    media_type: 'STORIES',
    access_token: token,
  };
  if (isVideo) params.video_url = mediaUrl;
  else         params.image_url = mediaUrl;

  logger.info(`IG story container creating (type=${isVideo ? 'video' : 'image'})`);
  const { data: container } = await axios.post(
    `${ig.IG_GRAPH_URL}/${igAccountId}/media`,
    null,
    { params }
  );
  await waitForMediaProcessing(container.id, token);
  const { data: publishData } = await axios.post(
    `${ig.IG_GRAPH_URL}/${igAccountId}/media_publish`,
    null,
    { params: { creation_id: container.id, access_token: token } }
  );
  return publishData.id;
}

async function publishSingleMedia(igAccountId, token, content, media, publicBaseUrl, options = {}) {
  const isVideo = media.mimeType.startsWith('video/');
  const mediaUrl = publicMediaUrl(media, publicBaseUrl);

  // Meta's Instagram Graph API expects parameters as URL query string, not JSON body.
  const params = {
    caption: content,
    access_token: token,
  };
  if (isVideo) {
    params.video_url = mediaUrl;
    params.media_type = 'REELS';
  } else {
    params.image_url = mediaUrl;
  }
  // Collaborators get a JSON array of IG usernames. Each invitee
  // receives a notification and the post lands on their profile
  // once accepted.
  if (Array.isArray(options.collaborators) && options.collaborators.length > 0) {
    params.collaborators = JSON.stringify(options.collaborators);
  }

  logger.info(`IG publish: creating media container at ${ig.IG_GRAPH_URL}/${igAccountId}/media`, {
    image_url: params.image_url,
    video_url: params.video_url,
    media_type: params.media_type || '(not set)',
    caption_length: content?.length || 0,
  });

  const { data: container } = await axios.post(
    `${ig.IG_GRAPH_URL}/${igAccountId}/media`,
    null,
    { params }
  );

  await waitForMediaProcessing(container.id, token);

  const { data: publishData } = await axios.post(
    `${ig.IG_GRAPH_URL}/${igAccountId}/media_publish`,
    null,
    { params: { creation_id: container.id, access_token: token } }
  );

  return publishData.id;
}

async function publishCarousel(igAccountId, token, content, mediaFiles, publicBaseUrl, options = {}) {
  const childIds = [];

  for (const media of mediaFiles) {
    const isVideo = media.mimeType.startsWith('video/');
    const mediaUrl = publicMediaUrl(media, publicBaseUrl);
    const params = {
      is_carousel_item: true,
      access_token: token,
    };

    if (isVideo) {
      params.video_url = mediaUrl;
      params.media_type = 'VIDEO';
    } else {
      params.image_url = mediaUrl;
    }

    const { data } = await axios.post(`${ig.IG_GRAPH_URL}/${igAccountId}/media`, null, { params });
    childIds.push(data.id);

    await waitForMediaProcessing(data.id, token);
  }

  const carouselParams = {
    caption: content,
    media_type: 'CAROUSEL',
    children: childIds.join(','),
    access_token: token,
  };
  if (Array.isArray(options.collaborators) && options.collaborators.length > 0) {
    carouselParams.collaborators = JSON.stringify(options.collaborators);
  }
  const { data: carousel } = await axios.post(
    `${ig.IG_GRAPH_URL}/${igAccountId}/media`,
    null,
    { params: carouselParams }
  );

  await waitForMediaProcessing(carousel.id, token);

  const { data: publishData } = await axios.post(
    `${ig.IG_GRAPH_URL}/${igAccountId}/media_publish`,
    null,
    { params: { creation_id: carousel.id, access_token: token } }
  );

  return publishData.id;
}

async function waitForMediaProcessing(containerId, token, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    const { data } = await axios.get(`${ig.IG_GRAPH_URL}/${containerId}`, {
      params: { fields: 'status_code', access_token: token },
    });

    if (data.status_code === 'FINISHED' || data.status_code === 'PUBLISHED') return;
    if (data.status_code === 'ERROR') throw new Error('Instagram media processing failed');
    if (data.status_code === 'EXPIRED') throw new Error('Instagram media container expired before publishing');

    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  throw new Error('Instagram media processing timed out');
}

// Post a comment on a freshly-published IG media. Used by the "first
// comment" feature so users can dump the hashtag list under the post
// instead of cluttering the caption.
async function postInstagramComment(mediaId, encryptedToken, message) {
  if (!message || !message.trim()) return null;
  const token = decrypt(encryptedToken);
  const { data } = await axios.post(
    `${ig.IG_GRAPH_URL}/${mediaId}/comments`,
    null,
    { params: { message: message.trim(), access_token: token }, timeout: 12000 }
  );
  return data?.id || null;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  refreshLongLivedToken,
  fetchInstagramAccount,
  publishToInstagram,
  postInstagramComment,
};
