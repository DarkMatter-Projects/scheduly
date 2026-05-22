const crypto = require('crypto');
const axios = require('axios');
const pool = require('../config/db');
const env = require('../config/env');
const fb = require('../config/facebook');
const ig = require('../config/instagram');
const facebookService = require('../services/facebook.service');
const instagramService = require('../services/instagram.service');
const instagramImportService = require('../services/instagram_import.service');
const googleAdsService = require('../services/google_ads.service');
const tiktokAdsService = require('../services/tiktok_ads.service');
const tiktokPostingService = require('../services/tiktok_posting.service');
const linkedinService = require('../services/linkedin.service');
const { decrypt } = require('../services/token.service');
const logger = require('../utils/logger');

// In-memory cache of fresh profile picture URLs, keyed by social_account.id.
// Meta CDN URLs expire (the `oe` query param), so we resolve them lazily and
// cache for ~5 minutes to avoid hammering the Graph API on every page render.
const avatarCache = new Map();
const AVATAR_TTL_MS = 5 * 60 * 1000;

// Primary client URL for OAuth redirects back to the frontend.
// Uses CLIENT_URL if set, otherwise the first origin in CLIENT_URLS, otherwise localhost.
function clientBase() {
  return process.env.CLIENT_URL || env.clientOrigins[0] || 'http://localhost:5173';
}

// In-memory store for CSRF state tokens (adequate for ~20 users)
const pendingStates = new Map();

async function listAccounts(req, res, next) {
  try {
    // Only return active accounts. Disconnected (is_active = 0) rows are kept
    // in the DB so historical post_targets still resolve, but they're hidden
    // from the UI. Pass ?includeInactive=1 to see them all.
    const includeInactive = req.query.includeInactive === '1';
    const where = includeInactive ? '1=1' : 'sa.is_active = 1';
    const [rows] = await pool.execute(
      `SELECT sa.id, sa.platform, sa.platform_account_id, sa.account_name, sa.token_expires_at,
              sa.fb_page_id, sa.profile_picture_url, sa.is_active, sa.connected_by, sa.team_id, sa.client_id, sa.created_at,
              u.first_name, u.last_name,
              c.name AS client_name, c.color AS client_color
       FROM social_accounts sa
       JOIN users u ON sa.connected_by = u.id
       LEFT JOIN clients c ON sa.client_id = c.id
       WHERE ${where}
       ORDER BY sa.created_at DESC`
    );

    const accounts = rows.map(r => ({
      id: r.id,
      platform: r.platform,
      platformAccountId: r.platform_account_id,
      accountName: r.account_name,
      tokenExpiresAt: r.token_expires_at,
      fbPageId: r.fb_page_id,
      profilePictureUrl: r.profile_picture_url,
      isActive: !!r.is_active,
      connectedBy: r.connected_by,
      connectedByName: `${r.first_name} ${r.last_name}`,
      teamId: r.team_id,
      clientId: r.client_id,
      clientName: r.client_name,
      clientColor: r.client_color,
      createdAt: r.created_at,
      tokenStatus: getTokenStatus(r.token_expires_at),
    }));

    res.json(accounts);
  } catch (err) {
    next(err);
  }
}

function getTokenStatus(expiresAt) {
  if (!expiresAt) return 'valid'; // Page tokens don't expire
  const now = new Date();
  const expires = new Date(expiresAt);
  const daysLeft = (expires - now) / (1000 * 60 * 60 * 24);
  if (daysLeft < 0) return 'expired';
  if (daysLeft < 7) return 'expiring';
  return 'valid';
}

async function startOAuth(req, res, next) {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, {
      userId: req.user.userId,
      teamId: req.query.teamId || null,
      timestamp: Date.now(),
    });

    // Clean old states (> 10 minutes)
    for (const [key, val] of pendingStates) {
      if (Date.now() - val.timestamp > 600000) pendingStates.delete(key);
    }

    const authUrl = facebookService.getAuthUrl(state);
    res.json({ authUrl });
  } catch (err) {
    next(err);
  }
}

async function oauthCallback(req, res, next) {
  try {
    const { code, state, error } = req.query;

    if (error) {
      logger.warn(`Facebook OAuth denied: ${error}`);
      return res.redirect(`${clientBase()}/accounts?error=oauth_denied`);
    }

    if (!state || !pendingStates.has(state)) {
      return res.redirect(`${clientBase()}/accounts?error=invalid_state`);
    }

    const { userId, teamId } = pendingStates.get(state);
    pendingStates.delete(state);

    // Exchange code for token
    const { accessToken } = await facebookService.exchangeCodeForToken(code);

    // Fetch pages and Instagram accounts
    const accounts = await facebookService.fetchPagesAndInstagram(accessToken, userId, teamId);

    // Best-effort: also pull Meta ad accounts (won't fail OAuth if ads scope was denied)
    let adAccountCount = 0;
    try {
      const metaAds = require('../services/meta_ads.service');
      const adAccounts = await metaAds.fetchAndStoreAdAccounts(accessToken, userId, teamId);
      adAccountCount = adAccounts.length;
    } catch (e) {
      logger.warn(`Facebook OAuth: ad accounts skipped (${e.message})`);
    }

    logger.info(`Facebook OAuth: connected ${accounts.length} account(s) + ${adAccountCount} ad account(s) for user ${userId}`);

    // Redirect back to accounts page with success
    res.redirect(`${clientBase()}/accounts?connected=${accounts.length}&adAccounts=${adAccountCount}`);
  } catch (err) {
    logger.error('Facebook OAuth callback error:', { error: err.message });
    res.redirect(`${clientBase()}/accounts?error=connection_failed`);
  }
}

async function startInstagramOAuth(req, res, next) {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, {
      userId: req.user.userId,
      teamId: req.query.teamId || null,
      platform: 'instagram',
      timestamp: Date.now(),
    });

    // Clean old states
    for (const [key, val] of pendingStates) {
      if (Date.now() - val.timestamp > 600000) pendingStates.delete(key);
    }

    const authUrl = instagramService.getAuthUrl(state);
    res.json({ authUrl });
  } catch (err) {
    next(err);
  }
}

async function instagramCallback(req, res, next) {
  const clientUrl = clientBase();
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      logger.warn(`Instagram OAuth denied: ${error} - ${error_description}`);
      return res.redirect(`${clientUrl}/accounts?error=oauth_denied`);
    }

    if (!state || !pendingStates.has(state)) {
      return res.redirect(`${clientUrl}/accounts?error=invalid_state`);
    }

    const { userId, teamId } = pendingStates.get(state);
    pendingStates.delete(state);

    // Step 1: Exchange code for short-lived token
    const { accessToken: shortToken, userId: igUserId } = await instagramService.exchangeCodeForToken(code);

    // Step 2: Exchange for long-lived token (60 days)
    const { accessToken: longToken } = await instagramService.exchangeForLongLivedToken(shortToken);

    // Step 3: Fetch profile and store account
    await instagramService.fetchInstagramAccount(longToken, igUserId, userId, teamId);

    logger.info(`Instagram OAuth: connected account ${igUserId} for user ${userId}`);
    res.redirect(`${clientUrl}/accounts?connected=1`);
  } catch (err) {
    logger.error('Instagram OAuth callback error:', {
      error: err.message,
      response: err.response?.data,
    });
    res.redirect(`${clientUrl}/accounts?error=connection_failed`);
  }
}

async function getAccountAvatar(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) return res.status(400).end();

    const cached = avatarCache.get(id);
    if (cached && cached.expiresAt > Date.now() && cached.url) {
      res.setHeader('Cache-Control', 'public, max-age=300');
      return res.redirect(302, cached.url);
    }

    const [rows] = await pool.execute(
      'SELECT id, platform, platform_account_id, access_token, profile_picture_url FROM social_accounts WHERE id = ?',
      [id]
    );
    if (rows.length === 0) return res.status(404).end();
    const account = rows[0];

    let freshUrl = null;
    try {
      const token = decrypt(account.access_token);
      if (account.platform === 'facebook_page') {
        const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${account.platform_account_id}`, {
          params: { fields: 'picture.type(large)', access_token: token },
          timeout: 5000,
        });
        freshUrl = data.picture?.data?.url || null;
      } else if (account.platform === 'instagram_business') {
        const { data } = await axios.get(`${ig.IG_GRAPH_URL}/${account.platform_account_id}`, {
          params: { fields: 'profile_picture_url', access_token: token },
          timeout: 5000,
        });
        freshUrl = data.profile_picture_url || null;
      }
    } catch (e) {
      logger.warn(`Avatar fetch failed for account ${id}: ${e.message}`);
    }

    const url = freshUrl || account.profile_picture_url;
    if (!url) return res.status(404).end();

    avatarCache.set(id, { url, expiresAt: Date.now() + AVATAR_TTL_MS });
    if (freshUrl && freshUrl !== account.profile_picture_url) {
      pool.execute('UPDATE social_accounts SET profile_picture_url = ? WHERE id = ?', [freshUrl, id])
        .catch((e) => logger.warn(`Avatar URL persist failed: ${e.message}`));
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.redirect(302, url);
  } catch (err) {
    next(err);
  }
}

async function startGoogleOAuth(req, res, next) {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, {
      userId: req.user.userId,
      teamId: req.query.teamId || null,
      platform: 'google',
      timestamp: Date.now(),
    });

    for (const [key, val] of pendingStates) {
      if (Date.now() - val.timestamp > 600000) pendingStates.delete(key);
    }

    const authUrl = googleAdsService.getAuthUrl(state);
    res.json({ authUrl });
  } catch (err) {
    next(err);
  }
}

async function googleOAuthCallback(req, res, next) {
  const clientUrl = clientBase();
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      logger.warn(`Google OAuth denied: ${error} - ${error_description}`);
      return res.redirect(`${clientUrl}/ads?error=oauth_denied`);
    }
    if (!state || !pendingStates.has(state)) {
      return res.redirect(`${clientUrl}/ads?error=invalid_state`);
    }

    const { userId, teamId } = pendingStates.get(state);
    pendingStates.delete(state);

    const tokens = await googleAdsService.exchangeCodeForToken(code);
    if (!tokens.refreshToken) {
      // Happens when the same Google account previously consented and
      // didn't include prompt=consent. We force it on getAuthUrl, but
      // surface a clear error if it still ends up missing.
      logger.warn('Google OAuth: no refresh_token in response — revoke prior grant and retry.');
      return res.redirect(`${clientUrl}/ads?error=google_no_refresh_token`);
    }
    const userInfo = await googleAdsService.fetchUserInfo(tokens.accessToken);
    const grantId = await googleAdsService.storeGrant({ tokens, userInfo, userId, teamId });

    // Try to discover ad accounts. Without a dev token this will error and we
    // store the message on the grant; UI surfaces it. Either way, OAuth itself
    // succeeded so we redirect with a success flag.
    let discovered = 0;
    try {
      const customers = await googleAdsService.discoverAccounts(grantId);
      discovered = customers.length;
    } catch (e) {
      logger.warn(`Google OAuth: account discovery skipped (${e.message})`);
    }

    logger.info(`Google OAuth: user ${userId} connected ${userInfo.email}, ${discovered} ad account(s) discovered`);
    return res.redirect(`${clientUrl}/ads?googleConnected=1&adAccounts=${discovered}`);
  } catch (err) {
    logger.error('Google OAuth callback error:', {
      error: err.message,
      response: err.response?.data,
    });
    return res.redirect(`${clientUrl}/ads?error=google_connection_failed`);
  }
}

// TikTok Login Kit (organic posting) — separate from TikTok Ads OAuth below.
async function startTiktokLoginOAuth(req, res, next) {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, {
      userId: req.user.userId,
      teamId: req.query.teamId || null,
      platform: 'tiktok_login',
      timestamp: Date.now(),
    });
    for (const [key, val] of pendingStates) {
      if (Date.now() - val.timestamp > 600000) pendingStates.delete(key);
    }
    const authUrl = tiktokPostingService.getAuthUrl(state);
    res.json({ authUrl });
  } catch (err) {
    next(err);
  }
}

async function startLinkedinOAuth(req, res, next) {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, {
      userId: req.user.userId,
      teamId: req.query.teamId || null,
      platform: 'linkedin',
      timestamp: Date.now(),
    });
    for (const [key, val] of pendingStates) {
      if (Date.now() - val.timestamp > 600000) pendingStates.delete(key);
    }
    const authUrl = linkedinService.getAuthUrl(state);
    res.json({ authUrl });
  } catch (err) { next(err); }
}

async function linkedinCallback(req, res, next) {
  const clientUrl = clientBase();
  try {
    const { code, state, error, error_description } = req.query;
    if (error) {
      logger.warn(`LinkedIn OAuth denied: ${error} - ${error_description}`);
      return res.redirect(`${clientUrl}/accounts?error=oauth_denied`);
    }
    if (!state || !pendingStates.has(state)) {
      return res.redirect(`${clientUrl}/accounts?error=invalid_state`);
    }
    const { userId, teamId } = pendingStates.get(state);
    pendingStates.delete(state);

    const tokens = await linkedinService.exchangeCodeForToken(code);
    const userInfo = await linkedinService.fetchUserInfo(tokens.accessToken);
    await linkedinService.storeAccount({ tokens, userInfo, userId, teamId });

    logger.info(`LinkedIn OAuth: user ${userId} connected ${userInfo.name || userInfo.sub}`);
    return res.redirect(`${clientUrl}/accounts?connected=1`);
  } catch (err) {
    const apiBody = err.response?.data;
    const detail = (apiBody && typeof apiBody === 'object'
      ? apiBody.error_description || apiBody.message || JSON.stringify(apiBody).slice(0, 200)
      : null) || err.message || 'Unknown error';
    logger.error('LinkedIn OAuth callback error:', { message: err.message, response: apiBody });
    const enc = encodeURIComponent(detail.slice(0, 300));
    return res.redirect(`${clientUrl}/accounts?error=linkedin_failed&detail=${enc}`);
  }
}

async function tiktokLoginCallback(req, res, next) {
  const clientUrl = clientBase();
  try {
    const { code, state, error, error_description } = req.query;
    if (error) {
      logger.warn(`TikTok Login OAuth denied: ${error} - ${error_description}`);
      return res.redirect(`${clientUrl}/accounts?error=oauth_denied`);
    }
    if (!state || !pendingStates.has(state)) {
      return res.redirect(`${clientUrl}/accounts?error=invalid_state`);
    }
    const { userId, teamId } = pendingStates.get(state);
    pendingStates.delete(state);

    const tokens = await tiktokPostingService.exchangeCodeForToken(code);
    const userInfo = await tiktokPostingService.fetchUserInfo(tokens.accessToken);
    await tiktokPostingService.storeAccount({ tokens, userInfo, userId, teamId });

    logger.info(`TikTok Login OAuth: user ${userId} connected ${userInfo.username || tokens.openId}`);
    return res.redirect(`${clientUrl}/accounts?connected=1`);
  } catch (err) {
    // Surface the actual reason in the redirect so the UI can show it.
    // TikTok's error body (when present) is the most informative.
    const apiBody = err.response?.data;
    const detail = (apiBody && typeof apiBody === 'object'
      ? apiBody.error?.message || apiBody.error_description || JSON.stringify(apiBody).slice(0, 200)
      : null) || err.message || 'Unknown error';
    logger.error('TikTok Login OAuth callback error:', {
      message: err.message,
      response: apiBody,
    });
    const enc = encodeURIComponent(detail.slice(0, 300));
    return res.redirect(`${clientUrl}/accounts?error=tiktok_login_failed&detail=${enc}`);
  }
}

async function disconnectAccount(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.execute('UPDATE social_accounts SET is_active = 0 WHERE id = ?', [id]);
    res.json({ message: 'Account disconnected' });
  } catch (err) {
    next(err);
  }
}

async function reconnectAccount(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    await pool.execute('UPDATE social_accounts SET is_active = 1 WHERE id = ?', [id]);
    res.json({ message: 'Account reconnected' });
  } catch (err) {
    next(err);
  }
}

async function startTikTokOAuth(req, res, next) {
  try {
    const state = crypto.randomBytes(16).toString('hex');
    pendingStates.set(state, {
      userId: req.user.userId,
      teamId: req.query.teamId || null,
      platform: 'tiktok',
      timestamp: Date.now(),
    });
    for (const [key, val] of pendingStates) {
      if (Date.now() - val.timestamp > 600000) pendingStates.delete(key);
    }
    const authUrl = tiktokAdsService.getAuthUrl(state);
    res.json({ authUrl });
  } catch (err) {
    next(err);
  }
}

async function tiktokOAuthCallback(req, res, next) {
  const clientUrl = clientBase();
  try {
    // TikTok returns ?code or ?auth_code depending on the version of the
    // portal endpoint. Accept both.
    const code = req.query.code || req.query.auth_code;
    const state = req.query.state;
    const error = req.query.error || req.query.error_code;
    const errorDesc = req.query.error_description || req.query.error_message;

    if (error) {
      logger.warn(`TikTok OAuth denied: ${error} - ${errorDesc}`);
      return res.redirect(`${clientUrl}/ads?error=oauth_denied`);
    }
    if (!state || !pendingStates.has(state)) {
      return res.redirect(`${clientUrl}/ads?error=invalid_state`);
    }
    const { userId, teamId } = pendingStates.get(state);
    pendingStates.delete(state);

    const tokens = await tiktokAdsService.exchangeCodeForToken(code);
    const { grantId } = await tiktokAdsService.storeGrant({ tokens, userId, teamId });

    let discovered = 0;
    try {
      const advertisers = await tiktokAdsService.discoverAccounts(grantId);
      discovered = advertisers.length;
    } catch (e) {
      logger.warn(`TikTok OAuth: account discovery skipped (${e.message})`);
    }

    logger.info(`TikTok OAuth: user ${userId} connected, ${discovered} advertiser(s) discovered`);
    return res.redirect(`${clientUrl}/ads?tiktokConnected=1&adAccounts=${discovered}`);
  } catch (err) {
    logger.error('TikTok OAuth callback error:', {
      error: err.message,
      response: err.response?.data,
    });
    return res.redirect(`${clientUrl}/ads?error=tiktok_connection_failed`);
  }
}

async function importHistory(req, res, next) {
  try {
    const accountId = parseInt(req.params.id, 10);
    const result = await instagramImportService.importHistory(accountId, req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAccounts,
  startOAuth,
  oauthCallback,
  startInstagramOAuth,
  instagramCallback,
  startGoogleOAuth,
  googleOAuthCallback,
  startTikTokOAuth,
  tiktokOAuthCallback,
  startTiktokLoginOAuth,
  tiktokLoginCallback,
  startLinkedinOAuth,
  linkedinCallback,
  disconnectAccount,
  reconnectAccount,
  getAccountAvatar,
  importHistory,
};
