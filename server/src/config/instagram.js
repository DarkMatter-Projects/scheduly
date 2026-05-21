const env = require('./env');

const IG_OAUTH_URL = 'https://www.instagram.com/oauth/authorize';
const IG_TOKEN_URL = 'https://api.instagram.com/oauth/access_token';
const IG_GRAPH_URL = 'https://graph.instagram.com';

const IG_SCOPES = [
  'instagram_business_basic',
  'instagram_business_content_publish',
  'instagram_business_manage_comments',
  'instagram_business_manage_messages',
  'instagram_business_manage_insights',
].join(',');

module.exports = {
  IG_OAUTH_URL,
  IG_TOKEN_URL,
  IG_GRAPH_URL,
  IG_SCOPES,
  // Instagram app can be the same as FB app if the IG product is added
  appId: env.instagram?.appId || env.facebook.appId,
  appSecret: env.instagram?.appSecret || env.facebook.appSecret,
  redirectUri: env.instagram?.redirectUri || `${env.serverUrl || 'http://localhost:3001'}/api/social/auth/instagram/callback`,
};
