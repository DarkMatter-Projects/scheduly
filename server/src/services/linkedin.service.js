const axios = require('axios');
const pool = require('../config/db');
const li = require('../config/linkedin');
const { encrypt, decrypt } = require('./token.service');
const storage = require('./storage.service');
const logger = require('../utils/logger');

// ── OAuth ─────────────────────────────────────────────────────────────────────

function getAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: li.clientId,
    redirect_uri: li.redirectUri,
    scope: li.LINKEDIN_SCOPES,
    state,
  });
  return `${li.LINKEDIN_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const form = new URLSearchParams();
  form.append('grant_type', 'authorization_code');
  form.append('code', code);
  form.append('client_id', li.clientId);
  form.append('client_secret', li.clientSecret);
  form.append('redirect_uri', li.redirectUri);

  const { data } = await axios.post(li.LINKEDIN_TOKEN_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000,
  });
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,      // typically 60 days
    refreshToken: data.refresh_token, // only returned if "Refresh Tokens" is enabled on the app
    refreshExpiresIn: data.refresh_token_expires_in,
    scope: data.scope,
  };
}

// OpenID Connect userinfo — returns the connected member's identity.
async function fetchUserInfo(accessToken) {
  const { data } = await axios.get(`${li.LINKEDIN_API_BASE}/v2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 10000,
  });
  // Fields: sub, name, given_name, family_name, picture, email, email_verified, locale
  return data;
}

// Persist the LinkedIn account into social_accounts as platform='linkedin'.
async function storeAccount({ tokens, userInfo, userId, teamId }) {
  const accessExpires = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;
  const refreshExpires = tokens.refreshExpiresIn ? new Date(Date.now() + tokens.refreshExpiresIn * 1000) : null;
  const accountName = userInfo.name || userInfo.email || `LinkedIn ${userInfo.sub.slice(0, 8)}`;

  await pool.execute(
    `INSERT INTO social_accounts
       (platform, platform_account_id, account_name, access_token, refresh_token,
        token_expires_at, refresh_token_expires_at, profile_picture_url, connected_by, team_id)
     VALUES ('linkedin', ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       account_name = VALUES(account_name),
       access_token = VALUES(access_token),
       refresh_token = VALUES(refresh_token),
       token_expires_at = VALUES(token_expires_at),
       refresh_token_expires_at = VALUES(refresh_token_expires_at),
       profile_picture_url = VALUES(profile_picture_url),
       is_active = 1`,
    [
      userInfo.sub,
      accountName,
      encrypt(tokens.accessToken),
      tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
      accessExpires,
      refreshExpires,
      userInfo.picture || null,
      userId,
      teamId || null,
    ]
  );

  return { sub: userInfo.sub, accountName };
}

// ── Publishing ────────────────────────────────────────────────────────────────

// LinkedIn's Posts API takes an author URN. For personal feed it's
// `urn:li:person:{sub}`; for an org page it would be `urn:li:organization:{id}`
// once Community Management API is approved.
function authorUrnFor(account) {
  return `urn:li:person:${account.platform_account_id}`;
}

// Public URL of a media file — LinkedIn fetches the asset directly from
// our URL during the upload step. With R2 configured this is an absolute
// Cloudflare URL; otherwise falls back to IG_PUBLIC_BASE_URL + /uploads/...
function publicMediaUrl(media) {
  const url = storage.publicUrlFor(media.filePath);
  if (url && url.startsWith('http')) return url;
  const base = process.env.IG_PUBLIC_BASE_URL || null;
  if (!base) {
    throw new Error('No public URL for media. Configure R2_* env vars or set IG_PUBLIC_BASE_URL so LinkedIn can fetch the file.');
  }
  return `${base}${url}`;
}

// LinkedIn requires us to register an upload, PUT bytes into it, then reference
// the returned asset URN in the post body. The "Images" / "Videos" REST APIs
// (versioned, LinkedIn-Version header required) are the modern path.
const LINKEDIN_API_VERSION = '202507';

// LinkedIn document upload — supports PDF, PPT, PPTX, DOC, DOCX. We
// detect by mime type so the publisher can route PDF attachments to
// this path instead of the image one (which would fail with an
// "unsupported_mime_type" error).
function isDocumentMime(mime) {
  if (!mime) return false;
  return mime === 'application/pdf'
      || mime === 'application/msword'
      || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      || mime === 'application/vnd.ms-powerpoint'
      || mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
}

async function uploadDocument(accessToken, ownerUrn, media) {
  // Documents follow the same initialize-then-PUT pattern as images,
  // but on a dedicated /rest/documents endpoint.
  const { data: init } = await axios.post(
    `${li.LINKEDIN_API_BASE}/rest/documents?action=initializeUpload`,
    { initializeUploadRequest: { owner: ownerUrn } },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  const uploadUrl = init.value.uploadUrl;
  const docUrn = init.value.document;

  const sourceUrl = publicMediaUrl(media);
  const { data: bytes } = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 120000 });
  await axios.put(uploadUrl, bytes, {
    headers: { 'Content-Type': media.mimeType || 'application/octet-stream' },
    timeout: 180000,
    maxBodyLength: Infinity,
  });

  return docUrn;
}

async function uploadImage(accessToken, ownerUrn, media) {
  // Step 1: initialize the image upload.
  const { data: init } = await axios.post(
    `${li.LINKEDIN_API_BASE}/rest/images?action=initializeUpload`,
    { initializeUploadRequest: { owner: ownerUrn } },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  const uploadUrl = init.value.uploadUrl;
  const imageUrn  = init.value.image;

  // Step 2: download our media into memory then PUT to LinkedIn. The asset has
  // to be the raw bytes, not a URL — LinkedIn doesn't have a pull-from-URL mode
  // for the new Images API.
  const sourceUrl = publicMediaUrl(media);
  const { data: bytes } = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 60000 });
  await axios.put(uploadUrl, bytes, {
    headers: { 'Content-Type': media.mimeType || 'application/octet-stream' },
    timeout: 120000,
    maxBodyLength: Infinity,
  });

  return imageUrn;
}

async function uploadVideo(accessToken, ownerUrn, media) {
  const sourceUrl = publicMediaUrl(media);
  const { data: bytes } = await axios.get(sourceUrl, { responseType: 'arraybuffer', timeout: 120000 });
  const fileSize = bytes.length;

  // Step 1: initialize. For videos LinkedIn returns multiple upload URLs for
  // chunked PUTs; we use a single chunk since our typical uploads are small.
  const { data: init } = await axios.post(
    `${li.LINKEDIN_API_BASE}/rest/videos?action=initializeUpload`,
    {
      initializeUploadRequest: {
        owner: ownerUrn,
        fileSizeBytes: fileSize,
        uploadCaptions: false,
        uploadThumbnail: false,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  );
  const videoUrn = init.value.video;
  const uploadInstructions = init.value.uploadInstructions || [];
  const uploadedPartIds = [];

  for (const instr of uploadInstructions) {
    const partBytes = bytes.slice(instr.firstByte, instr.lastByte + 1);
    const partRes = await axios.put(instr.uploadUrl, partBytes, {
      headers: { 'Content-Type': media.mimeType || 'application/octet-stream' },
      timeout: 120000,
      maxBodyLength: Infinity,
    });
    const etag = partRes.headers.etag || partRes.headers.ETag;
    if (etag) uploadedPartIds.push(etag.replace(/"/g, ''));
  }

  // Step 2: finalize the upload.
  await axios.post(
    `${li.LINKEDIN_API_BASE}/rest/videos?action=finalizeUpload`,
    {
      finalizeUploadRequest: {
        video: videoUrn,
        uploadToken: init.value.uploadToken || '',
        uploadedPartIds,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'Content-Type': 'application/json',
      },
      timeout: 60000,
    }
  );

  return videoUrn;
}

async function publishToLinkedIn(socialAccountId, content, mediaFiles, options = {}) {
  const [rows] = await pool.execute('SELECT * FROM social_accounts WHERE id = ?', [socialAccountId]);
  if (rows.length === 0) throw new Error(`social_account ${socialAccountId} not found`);
  const account = rows[0];
  const accessToken = decrypt(account.access_token);
  const authorUrn = authorUrnFor(account);

  // Build post body. The /rest/posts endpoint takes content blocks.
  const body = {
    author: authorUrn,
    commentary: content || '',
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  // Article share — when an article URL is set, LinkedIn renders it
  // as a link preview card. We pass just the URL and let LinkedIn
  // scrape the title / description / thumbnail itself.
  if (options.articleUrl) {
    body.content = { article: { source: options.articleUrl } };
  } else if (!mediaFiles || mediaFiles.length === 0) {
    // Text-only post — no content block needed.
  } else if (mediaFiles.length === 1) {
    const m = mediaFiles[0];
    if ((m.mimeType || '').startsWith('video/')) {
      const videoUrn = await uploadVideo(accessToken, authorUrn, m);
      body.content = { media: { id: videoUrn } };
    } else if (isDocumentMime(m.mimeType)) {
      // Native PDF / DOC upload — separate /rest/documents endpoint.
      const docUrn = await uploadDocument(accessToken, authorUrn, m);
      body.content = { media: { id: docUrn, title: m.originalName || 'Document' } };
    } else {
      const imageUrn = await uploadImage(accessToken, authorUrn, m);
      body.content = { media: { id: imageUrn } };
    }
  } else {
    // Multi-image post — LinkedIn calls this a "multi-image carousel".
    const imageUrns = [];
    for (const m of mediaFiles) {
      if (!(m.mimeType || '').startsWith('image/')) {
        logger.warn(`LinkedIn: skipping non-image media in carousel (mime=${m.mimeType})`);
        continue;
      }
      imageUrns.push(await uploadImage(accessToken, authorUrn, m));
    }
    if (imageUrns.length > 0) {
      body.content = { multiImage: { images: imageUrns.map(id => ({ id })) } };
    }
  }

  const { data, headers } = await axios.post(
    `${li.LINKEDIN_API_BASE}/rest/posts`,
    body,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': LINKEDIN_API_VERSION,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    }
  );

  // LinkedIn returns the post URN in the `x-restli-id` response header.
  const postUrn = headers['x-restli-id'] || data?.id || null;
  if (!postUrn) throw new Error('LinkedIn post created but no URN returned');
  logger.info(`LinkedIn post published: ${postUrn}`);
  return postUrn;
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  fetchUserInfo,
  storeAccount,
  publishToLinkedIn,
};
