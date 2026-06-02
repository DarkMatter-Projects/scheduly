const { Router } = require('express');
const axios = require('axios');
const authenticate = require('../middleware/auth');
const requireRole = require('../middleware/rbac');
const pool = require('../config/db');
const { decrypt } = require('../services/token.service');
const googleConfig = require('../config/google');
const tiktokLoginConfig = require('../config/tiktok_login');
const linkedinConfig = require('../config/linkedin');
const youtubeConfig = require('../config/youtube');

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

// Inspect the granted scopes on a connected social account's stored token.
// Lets us tell at a glance whether a re-OAuth actually granted the new
// scopes vs returning a stale grant.
router.get('/account-scopes/:id', authenticate, requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const [rows] = await pool.execute('SELECT platform, account_name, access_token FROM social_accounts WHERE id = ?', [id]);
  if (rows.length === 0) return res.status(404).json({ error: 'Account not found' });
  const row = rows[0];
  let token;
  try { token = decrypt(row.access_token); }
  catch (e) { return res.json({ platform: row.platform, account: row.account_name, error: 'Token decrypt failed: ' + e.message }); }

  try {
    if (row.platform === 'facebook_page') {
      // /me/permissions is only valid for User tokens — Page tokens 404 it.
      // Use /debug_token instead which reveals the granted scopes for any
      // token type when authenticated with an app token.
      const fbConfig = require('../config/facebook');
      const appAccessToken = `${fbConfig.appId}|${fbConfig.appSecret}`;
      const { data } = await axios.get('https://graph.facebook.com/v21.0/debug_token', {
        params: { input_token: token, access_token: appAccessToken },
      });
      return res.json({
        platform: row.platform,
        account: row.account_name,
        tokenLength: token.length,
        scopes: data.data?.scopes || [],
        isValid: data.data?.is_valid,
        expiresAt: data.data?.expires_at,
        appId: data.data?.app_id,
        type: data.data?.type,
        rawDebugToken: data.data,
      });
    }
    if (row.platform === 'instagram_business') {
      const { data } = await axios.get('https://graph.instagram.com/me?fields=id,username,account_type', {
        params: { access_token: token },
      });
      return res.json({ platform: row.platform, account: row.account_name, tokenLength: token.length, response: data });
    }
    return res.json({ platform: row.platform, account: row.account_name, message: 'No scope check for this platform' });
  } catch (err) {
    return res.json({
      platform: row.platform,
      account: row.account_name,
      tokenLength: token.length,
      error: err.response?.data || err.message,
    });
  }
});

// Raw Meta /insights dump for a single post_targets row. Lets us see
// exactly what Meta is returning so we can tell whether the 0s in the
// Analytics page are real (post had 0 organic reach) or a parsing miss.
router.get('/post-insights/:postTargetId', authenticate, requireRole('admin'), async (req, res) => {
  const id = parseInt(req.params.postTargetId, 10);
  const [rows] = await pool.execute(
    `SELECT pt.platform_post_id, sa.platform, sa.access_token, sa.platform_account_id
     FROM post_targets pt
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE pt.id = ?`,
    [id]
  );
  if (rows.length === 0) return res.status(404).json({ error: 'Post target not found' });
  const t = rows[0];
  const token = decrypt(t.access_token);

  try {
    if (t.platform === 'facebook_page') {
      // Try modern metric set first
      const MODERN = 'post_impressions_organic_v2,post_impressions_unique,post_reactions_by_type_total,post_clicks,post_engaged_users';
      const { data } = await axios.get(`https://graph.facebook.com/v21.0/${t.platform_post_id}/insights`, {
        params: { metric: MODERN, access_token: token },
      });
      return res.json({ platform: 'facebook_page', postId: t.platform_post_id, metric: MODERN, response: data });
    }
    if (t.platform === 'instagram_business') {
      const { data } = await axios.get(`https://graph.instagram.com/${t.platform_post_id}/insights`, {
        params: { metric: 'views,reach,likes,comments,shares,saved', access_token: token },
      });
      return res.json({ platform: 'instagram_business', mediaId: t.platform_post_id, response: data });
    }
    return res.json({ platform: t.platform, message: 'No insights diagnostic for this platform' });
  } catch (err) {
    return res.json({
      platform: t.platform,
      postId: t.platform_post_id,
      error: err.response?.data || err.message,
    });
  }
});

// YouTube config sanity check — confirms env wiring without leaking secrets.
router.get('/youtube-config', authenticate, requireRole('admin'), (req, res) => {
  res.json({
    clientIdSet: !!youtubeConfig.clientId,
    clientIdSuffix: youtubeConfig.clientId ? youtubeConfig.clientId.slice(-30) : null,
    clientSecretSet: !!youtubeConfig.clientSecret,
    redirectUri: youtubeConfig.redirectUri,
    scopes: youtubeConfig.YOUTUBE_SCOPES,
    quotaDailyLimit: youtubeConfig.QUOTA_DAILY_LIMIT,
    quotaCostPerUpload: youtubeConfig.QUOTA_COST.videoUpload,
  });
});

// LinkedIn config sanity check — verifies env vars + redirect URI without
// leaking secrets. Hit this after setting LINKEDIN_CLIENT_ID / SECRET.
router.get('/linkedin-config', authenticate, requireRole('admin'), (req, res) => {
  const id = linkedinConfig.clientId;
  res.json({
    clientIdSet: !!id,
    clientIdLength: id ? id.length : 0,
    clientIdSuffix: id ? id.slice(-6) : null,
    clientSecretSet: !!linkedinConfig.clientSecret,
    redirectUri: linkedinConfig.redirectUri,
    scopes: linkedinConfig.LINKEDIN_SCOPES,
    authorizeUrl: linkedinConfig.LINKEDIN_AUTHORIZE_URL,
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

// Manual trigger for the daily follower snapshot — useful for backfilling
// today's row without waiting for the 5 AM cron, and for seeding a
// freshly-deployed environment so the dashboard cells aren't zero.
router.post('/run-follower-snapshot', authenticate, requireRole('admin'), async (req, res) => {
  const { runFollowerSnapshotJob } = require('../jobs/followerSnapshotJob');
  try {
    await runFollowerSnapshotJob();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Same shape but for the page-level channel insights job (engaged users,
// profile views/taps, follow/non-follow split). Hit this after a fresh
// deploy so the new widgets don't sit empty for a day.
router.post('/run-channel-insights', authenticate, requireRole('admin'), async (req, res) => {
  const { runChannelInsightsJob } = require('../jobs/channelInsightsJob');
  try {
    await runChannelInsightsJob();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
