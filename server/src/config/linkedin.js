const env = require('./env');

// LinkedIn for Developers — Share on LinkedIn + Sign In with LinkedIn (OIDC).
// Posting to personal feed only until Community Management API is approved.
const LINKEDIN_AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const LINKEDIN_TOKEN_URL     = 'https://www.linkedin.com/oauth/v2/accessToken';
const LINKEDIN_API_BASE      = 'https://api.linkedin.com';

// openid/profile/email → OIDC userinfo (gives us name, picture, sub URN)
// w_member_social → publish to the authenticated member's feed
const LINKEDIN_SCOPES = [
  'openid',
  'profile',
  'email',
  'w_member_social',
].join(' ');

module.exports = {
  LINKEDIN_AUTHORIZE_URL,
  LINKEDIN_TOKEN_URL,
  LINKEDIN_API_BASE,
  LINKEDIN_SCOPES,
  clientId: env.linkedin?.clientId,
  clientSecret: env.linkedin?.clientSecret,
  redirectUri: env.linkedin?.redirectUri,
};
