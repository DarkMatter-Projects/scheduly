const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const env = require('../config/env');
const { encrypt, decrypt } = require('./token.service');
const storage = require('./storage.service');
const webhooks = require('./meta_webhook.service');
const logger = require('../utils/logger');

// Build a public URL Meta can fetch. With R2 configured storage.publicUrlFor()
// returns an absolute URL; otherwise we fall back to publicBaseUrl + /uploads/...
function publicMediaUrl(media) {
  const url = storage.publicUrlFor(media.filePath);
  if (url && url.startsWith('http')) return url;
  const base = env.igPublicBaseUrl || null;
  if (!base) {
    throw new Error(
      'No public URL for media. Configure R2_* env vars or set IG_PUBLIC_BASE_URL so Facebook can fetch the file.'
    );
  }
  return `${base}${url}`;
}

// ── OAuth Flow ──

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: fb.appId,
    redirect_uri: fb.redirectUri,
    scope: fb.FB_PERMISSIONS,
    response_type: 'code',
    state,
  });
  return `${fb.FB_OAUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  // Step 1: Get short-lived user token
  const { data } = await axios.get(`${fb.FB_GRAPH_URL}/oauth/access_token`, {
    params: {
      client_id: fb.appId,
      client_secret: fb.appSecret,
      redirect_uri: fb.redirectUri,
      code,
    },
  });

  const shortLivedToken = data.access_token;

  // Step 2: Exchange for long-lived token (60 days)
  const { data: longLivedData } = await axios.get(`${fb.FB_GRAPH_URL}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: fb.appId,
      client_secret: fb.appSecret,
      fb_exchange_token: shortLivedToken,
    },
  });

  return {
    accessToken: longLivedData.access_token,
    expiresIn: longLivedData.expires_in, // seconds
  };
}

async function fetchPagesAndInstagram(userAccessToken, userId, teamId) {
  // Get pages the user manages
  const { data: pagesData } = await axios.get(`${fb.FB_GRAPH_URL}/me/accounts`, {
    params: {
      access_token: userAccessToken,
      fields: 'id,name,access_token,picture{url}',
    },
  });

  const accounts = [];

  for (const page of pagesData.data || []) {
    // Store Facebook Page
    const encryptedToken = encrypt(page.access_token);
    const profilePic = page.picture?.data?.url || null;

    await pool.execute(
      `INSERT INTO social_accounts (platform, platform_account_id, account_name, access_token, token_expires_at, profile_picture_url, connected_by, team_id)
       VALUES ('facebook_page', ?, ?, ?, NULL, ?, ?, ?)
       ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), account_name = VALUES(account_name), profile_picture_url = VALUES(profile_picture_url), is_active = 1`,
      [page.id, page.name, encryptedToken, profilePic, userId, teamId || null]
    );

    accounts.push({ platform: 'facebook_page', id: page.id, name: page.name });

    // Subscribe this page to feed + messages webhooks so the Engage inbox gets
    // real-time events. Best-effort — failure here doesn't block connect.
    await webhooks.subscribePageToWebhooks(page.id, page.access_token);

    // Check for linked Instagram Business account
    try {
      const { data: igData } = await axios.get(`${fb.FB_GRAPH_URL}/${page.id}`, {
        params: {
          fields: 'instagram_business_account{id,name,username,profile_picture_url}',
          access_token: page.access_token,
        },
      });

      if (igData.instagram_business_account) {
        const ig = igData.instagram_business_account;
        const igName = ig.username || ig.name || `IG @${ig.id}`;

        await pool.execute(
          `INSERT INTO social_accounts (platform, platform_account_id, account_name, access_token, token_expires_at, fb_page_id, profile_picture_url, connected_by, team_id)
           VALUES ('instagram_business', ?, ?, ?, NULL, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE access_token = VALUES(access_token), account_name = VALUES(account_name), profile_picture_url = VALUES(profile_picture_url), fb_page_id = VALUES(fb_page_id), is_active = 1`,
          [ig.id, igName, encryptedToken, page.id, ig.profile_picture_url || null, userId, teamId || null]
        );

        accounts.push({ platform: 'instagram_business', id: ig.id, name: igName });
      }
    } catch (igErr) {
      logger.warn(`Could not fetch IG account for page ${page.id}: ${igErr.message}`);
    }
  }

  return accounts;
}

// ── Publishing ──

async function publishToPage(pageId, pageToken, content, mediaFiles) {
  const token = decrypt(pageToken);

  if (!mediaFiles || mediaFiles.length === 0) {
    // Text-only post
    const { data } = await axios.post(`${fb.FB_GRAPH_URL}/${pageId}/feed`, {
      message: content,
      access_token: token,
    });
    return data.id;
  }

  if (mediaFiles.length === 1 && mediaFiles[0].mimeType.startsWith('image/')) {
    // Single photo via URL upload — Meta fetches it from R2 / public host so
    // it works the same on Railway as locally, no fs access required.
    const imageUrl = publicMediaUrl(mediaFiles[0]);
    const { data } = await axios.post(`${fb.FB_GRAPH_URL}/${pageId}/photos`, null, {
      params: { url: imageUrl, caption: content, access_token: token },
    });
    return data.id || data.post_id;
  }

  if (mediaFiles.length === 1 && mediaFiles[0].mimeType.startsWith('video/')) {
    // Single video via URL upload — Meta accepts file_url for /videos.
    const videoUrl = publicMediaUrl(mediaFiles[0]);
    const { data } = await axios.post(`${fb.FB_GRAPH_URL}/${pageId}/videos`, null, {
      params: { file_url: videoUrl, description: content, access_token: token },
    });
    return data.id;
  }

  // Multi-photo — upload each one unpublished by URL, then create a feed
  // post that attaches all of them.
  const photoIds = [];
  for (const media of mediaFiles) {
    if (!media.mimeType.startsWith('image/')) continue;
    const imageUrl = publicMediaUrl(media);
    const { data } = await axios.post(`${fb.FB_GRAPH_URL}/${pageId}/photos`, null, {
      params: { url: imageUrl, published: 'false', access_token: token },
    });
    photoIds.push(data.id);
  }

  const postBody = { message: content, access_token: token };
  photoIds.forEach((id, i) => {
    postBody[`attached_media[${i}]`] = JSON.stringify({ media_fbid: id });
  });
  const { data } = await axios.post(`${fb.FB_GRAPH_URL}/${pageId}/feed`, postBody);
  return data.id;
}

// ── Token Refresh ──

async function refreshLongLivedToken(currentToken) {
  const token = decrypt(currentToken);
  const { data } = await axios.get(`${fb.FB_GRAPH_URL}/oauth/access_token`, {
    params: {
      grant_type: 'fb_exchange_token',
      client_id: fb.appId,
      client_secret: fb.appSecret,
      fb_exchange_token: token,
    },
  });
  return {
    accessToken: encrypt(data.access_token),
    expiresIn: data.expires_in,
  };
}

// Pin or unpin a feed post at the top of the Page. is_pinned=true /
// false on a POST /{post-id} with a page access token. Errors bubble
// so the controller can translate them.
async function setPinned(pageAccessToken, platformPostId, pinned) {
  const { data } = await axios.post(
    `${fb.FB_GRAPH_URL}/${platformPostId}`,
    null,
    { params: { is_pinned: pinned ? 'true' : 'false', access_token: decrypt(pageAccessToken) }, timeout: 12000 }
  );
  return data?.success !== false;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  fetchPagesAndInstagram,
  publishToPage,
  refreshLongLivedToken,
  setPinned,
};
