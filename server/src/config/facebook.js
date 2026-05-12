const env = require('./env');

const FB_API_VERSION = 'v21.0';
const FB_GRAPH_URL = `https://graph.facebook.com/${FB_API_VERSION}`;
const FB_OAUTH_URL = `https://www.facebook.com/${FB_API_VERSION}/dialog/oauth`;

const FB_PERMISSIONS = [
  'public_profile',
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'ads_read',
  'ads_management',
  'business_management',
].join(',');

module.exports = {
  FB_API_VERSION,
  FB_GRAPH_URL,
  FB_OAUTH_URL,
  FB_PERMISSIONS,
  appId: env.facebook.appId,
  appSecret: env.facebook.appSecret,
  redirectUri: env.facebook.redirectUri,
};
