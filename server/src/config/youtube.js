const env = require('./env');

// YouTube Data API v3 — uses the same Google OAuth credentials as Google Ads
// (one Google Cloud project, multiple APIs enabled). The YouTube scopes are
// separate so we can keep the "Connect YouTube" flow clean without dragging
// in Ads-related grants.
const YOUTUBE_AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const YOUTUBE_TOKEN_URL     = 'https://oauth2.googleapis.com/token';
const YOUTUBE_API_BASE      = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_UPLOAD_BASE   = 'https://www.googleapis.com/upload/youtube/v3';

const YOUTUBE_SCOPES = [
  'https://www.googleapis.com/auth/youtube.upload',
  'https://www.googleapis.com/auth/youtube.readonly',
  // YouTube Analytics API — required for daily channel metrics,
  // subscribers gained/lost, watch time, and audience demographics.
  // Existing connections must re-OAuth to pick this up.
  'https://www.googleapis.com/auth/yt-analytics.readonly',
  'openid',
  'email',
  'profile',
].join(' ');

// Quota costs published by Google for API v3 actions we use.
const QUOTA_COST = {
  videoUpload: 1600,
  videoUpdate: 50,
  videoDelete: 50,
  videoList: 1,
  channelList: 1,
};

// Free-tier ceiling. Bump this env var after you've been granted a higher
// quota by the YouTube API audit.
const QUOTA_DAILY_LIMIT = parseInt(process.env.YOUTUBE_QUOTA_DAILY || '10000', 10);

module.exports = {
  YOUTUBE_AUTHORIZE_URL,
  YOUTUBE_TOKEN_URL,
  YOUTUBE_API_BASE,
  YOUTUBE_UPLOAD_BASE,
  YOUTUBE_SCOPES,
  QUOTA_COST,
  QUOTA_DAILY_LIMIT,
  // Reuse Google OAuth client + secret for the same Google Cloud project.
  clientId: env.google?.clientId,
  clientSecret: env.google?.clientSecret,
  redirectUri: env.youtube?.redirectUri,
};
