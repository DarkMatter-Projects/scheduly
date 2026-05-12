const env = require('./env');

const GOOGLE_OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

// Google Ads API REST. Each release is supported for ~12 months before
// Google starts returning 404 from its paths. Override via env if needed.
const GOOGLE_ADS_API_VERSION = process.env.GOOGLE_ADS_API_VERSION || 'v20';
const GOOGLE_ADS_API_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/adwords',
].join(' ');

module.exports = {
  GOOGLE_OAUTH_URL,
  GOOGLE_TOKEN_URL,
  GOOGLE_USERINFO_URL,
  GOOGLE_ADS_API_BASE,
  GOOGLE_ADS_API_VERSION,
  GOOGLE_SCOPES,
  clientId: env.google?.clientId,
  clientSecret: env.google?.clientSecret,
  redirectUri: env.google?.redirectUri,
  adsDeveloperToken: env.google?.adsDeveloperToken,
  adsLoginCustomerId: env.google?.adsLoginCustomerId,
};
