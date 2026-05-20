const env = require('./env');

// TikTok for Developers (Login Kit + Content Posting API). Separate from
// the TikTok for Business app in config/tiktok.js, which is for ads.
const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_REVOKE_URL = 'https://open.tiktokapis.com/v2/oauth/revoke/';
const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

// Login Kit scopes. video.upload = inbox mode, video.publish = direct post.
// Both are requested so the user can pick mode per-post.
const TIKTOK_SCOPES = [
  'user.info.basic',
  'video.upload',
  'video.publish',
].join(',');

module.exports = {
  TIKTOK_AUTHORIZE_URL,
  TIKTOK_TOKEN_URL,
  TIKTOK_REVOKE_URL,
  TIKTOK_API_BASE,
  TIKTOK_SCOPES,
  clientKey: env.tiktokLogin?.clientKey,
  clientSecret: env.tiktokLogin?.clientSecret,
  redirectUri: env.tiktokLogin?.redirectUri,
};
