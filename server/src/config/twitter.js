const env = require('./env');

// X (formerly Twitter) OAuth 2.0 with PKCE. Posting requires a Project app
// with elevated access; even read endpoints now need a project. Keys are
// issued at https://developer.x.com/en/portal/projects-and-apps.
const TWITTER_AUTHORIZE_URL = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN_URL     = 'https://api.x.com/2/oauth2/token';
const TWITTER_API_BASE      = 'https://api.x.com/2';

// tweet.read   — read tweets
// tweet.write  — publish tweets
// users.read   — fetch the authenticated user's profile (id, username, name)
// offline.access — issues a refresh token so we don't need to re-OAuth
//   every two hours
// follows.read — needed for follower count + per-user "following" KPI
const TWITTER_SCOPES = [
  'tweet.read',
  'tweet.write',
  'users.read',
  'follows.read',
  'offline.access',
].join(' ');

module.exports = {
  TWITTER_AUTHORIZE_URL,
  TWITTER_TOKEN_URL,
  TWITTER_API_BASE,
  TWITTER_SCOPES,
  clientId: env.twitter?.clientId,
  clientSecret: env.twitter?.clientSecret,
  redirectUri: env.twitter?.redirectUri,
};
