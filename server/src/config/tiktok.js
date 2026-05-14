const env = require('./env');

// TikTok Marketing API. Sandbox returns mock data; production needs app review.
// Toggle via TIKTOK_SANDBOX=1 to point at sandbox-ads.tiktok.com.
const SANDBOX = process.env.TIKTOK_SANDBOX === '1' || process.env.TIKTOK_SANDBOX === 'true';

const API_BASE = SANDBOX
  ? 'https://sandbox-ads.tiktok.com/open_api/v1.3'
  : 'https://business-api.tiktok.com/open_api/v1.3';

// OAuth authorize URL is the same for sandbox and prod — the TikTok app's
// type (sandbox vs prod) is set in the developer portal, not in the URL.
const TIKTOK_OAUTH_URL = 'https://business-api.tiktok.com/portal/auth';

const TIKTOK_SCOPES = [
  'user.info.basic',
  'ad_account.read',
  'report.read',
];

module.exports = {
  TIKTOK_OAUTH_URL,
  API_BASE,
  SANDBOX,
  TIKTOK_SCOPES,
  appId: env.tiktok?.appId,
  appSecret: env.tiktok?.appSecret,
  redirectUri: env.tiktok?.redirectUri,
};
