const { Router } = require('express');
const axios = require('axios');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const pool = require('../config/db');
const { decrypt } = require('../services/token.service');
const googleConfig = require('../config/google');
const tiktokLoginConfig = require('../config/tiktok_login');

const router = Router();

// Returns what the server thinks its Google config looks like — without
// leaking client secret or developer token values. Helps debug
// "redirect_uri_mismatch" / "invalid_client" from Google.
router.get('/google-config', authenticate, requireRole('admin'), (req, res) => {
  res.json({
    clientIdSet: !!googleConfig.clientId,
    clientIdSuffix: googleConfig.clientId ? googleConfig.clientId.slice(-30) : null,
    clientSecretSet: !!googleConfig.clientSecret,
    devTokenSet: !!googleConfig.adsDeveloperToken,
    redirectUri: googleConfig.redirectUri,
    scopes: googleConfig.GOOGLE_SCOPES,
  });
});

// Same idea for TikTok Login Kit — helps when OAuth bounces with
// "client_key" errors. Reveals only safe-to-show fields.
router.get('/tiktok-login-config', authenticate, requireRole('admin'), (req, res) => {
  const k = tiktokLoginConfig.clientKey;
  res.json({
    clientKeySet: !!k,
    clientKeyLength: k ? k.length : 0,
    clientKeyPrefix: k ? k.slice(0, 4) : null,
    clientKeySuffix: k ? k.slice(-4) : null,
    clientSecretSet: !!tiktokLoginConfig.clientSecret,
    redirectUri: tiktokLoginConfig.redirectUri,
    scopes: tiktokLoginConfig.TIKTOK_SCOPES,
    authorizeUrl: tiktokLoginConfig.TIKTOK_AUTHORIZE_URL,
  });
});

/**
 * GET /api/diagnose/instagram/:platformAccountId
 * Runs three checks:
 *  1. Profile fetch (proves the token is valid)
 *  2. Publish a known-good public image (httpbin.org)
 *  3. Publish our R2 image (uses the most recent uploaded media)
 * If #2 succeeds but #3 fails → R2 URL issue.
 * If both fail with the same 9004 error → permission/scope issue with the IG app.
 */
router.get('/instagram/:platformAccountId', authenticate, requireRole('admin'), async (req, res) => {
  const igAccountId = req.params.platformAccountId;
  const results = {};

  const [accounts] = await pool.execute(
    `SELECT access_token FROM social_accounts
     WHERE platform = 'instagram_business' AND platform_account_id = ?`,
    [igAccountId]
  );
  if (!accounts.length) return res.status(404).json({ error: 'IG account not found' });

  const token = decrypt(accounts[0].access_token);

  // 1. Profile check
  try {
    const { data } = await axios.get(`https://graph.instagram.com/${igAccountId}`, {
      params: { fields: 'id,username,account_type,name', access_token: token },
    });
    results.profile = { ok: true, data };
  } catch (e) {
    results.profile = { ok: false, status: e.response?.status, error: e.response?.data || e.message };
  }

  // 2. Publish-test with a known-good public image
  try {
    const { data } = await axios.post(
      `https://graph.instagram.com/${igAccountId}/media`,
      null,
      { params: {
        image_url: 'https://www.gstatic.com/webp/gallery/1.jpg',
        caption: 'diagnostic test',
        access_token: token,
      } }
    );
    results.testPublishWithPublicImage = { ok: true, containerId: data.id };
  } catch (e) {
    results.testPublishWithPublicImage = {
      ok: false,
      status: e.response?.status,
      error: e.response?.data || e.message,
    };
  }

  // 3. Publish-test with our most recent R2 image
  const [media] = await pool.execute(
    `SELECT m.file_path FROM media m
     WHERE m.mime_type LIKE 'image/%'
     ORDER BY m.created_at DESC LIMIT 1`
  );
  if (media.length && process.env.R2_PUBLIC_URL) {
    const r2Url = `${process.env.R2_PUBLIC_URL}/${media[0].file_path}`;
    results.r2Url = r2Url;
    try {
      const { data } = await axios.post(
        `https://graph.instagram.com/${igAccountId}/media`,
        null,
        { params: {
          image_url: r2Url,
          caption: 'diagnostic test',
          access_token: token,
        } }
      );
      results.testPublishWithR2Image = { ok: true, containerId: data.id };
    } catch (e) {
      results.testPublishWithR2Image = {
        ok: false,
        status: e.response?.status,
        error: e.response?.data || e.message,
      };
    }
  } else {
    results.testPublishWithR2Image = { skipped: 'No R2 media or R2_PUBLIC_URL not set' };
  }

  res.json(results);
});

module.exports = router;
