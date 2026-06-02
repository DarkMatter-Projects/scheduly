const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const ig = require('../config/instagram');
const linkedin = require('../config/linkedin');
const { decrypt } = require('./token.service');
const logger = require('../utils/logger');

// Fetch yesterday's page-level insights for an account and UPSERT a row
// into channel_insights_daily. Returns null instead of throwing on a per-
// account failure so one bad token doesn't abort the whole nightly run.
async function fetchInsightsForAccount(account, dateStr) {
  const token = decrypt(account.access_token);
  const day = dateStr || yesterday();

  if (account.platform === 'facebook_page') {
    return fetchFacebookPageInsights(account, token, day);
  }
  if (account.platform === 'instagram_business') {
    return fetchInstagramInsights(account, token, day);
  }
  if (account.platform === 'youtube') {
    return fetchYouTubeInsights(account, token, day);
  }
  if (account.platform === 'linkedin') {
    return fetchLinkedInInsights(account, token, day);
  }
  return null;
}

async function fetchFacebookPageInsights(account, token, day) {
  // page_engaged_users + page_views_total work on Page tokens with
  // pages_read_engagement. page_total_actions = profile CTA taps.
  // page_impressions_by_user_type returns a JSON breakdown { fan, non_fan }.
  const metrics = [
    'page_engaged_users',
    'page_views_total',
    'page_total_actions',
    'page_impressions_unique',
    'page_impressions_by_user_type',
  ].join(',');
  try {
    const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${account.platform_account_id}/insights`, {
      params: { metric: metrics, since: day, until: nextDay(day), period: 'day', access_token: token },
      timeout: 12000,
    });
    const items = data.data || [];
    const valueOf = (name) => {
      const entry = items.find(i => i.name === name);
      const v = entry?.values?.[0]?.value;
      return (typeof v === 'number') ? v : null;
    };
    // page_impressions_by_user_type returns { fan: N, non_fan: N }
    const userTypeBreakdown = items.find(i => i.name === 'page_impressions_by_user_type')?.values?.[0]?.value || {};
    return {
      engaged_users:      valueOf('page_engaged_users'),
      profile_views:      valueOf('page_views_total'),
      profile_taps:       valueOf('page_total_actions'),
      reach_unique:       valueOf('page_impressions_unique'),
      follower_views:     numberOr(userTypeBreakdown.fan),
      non_follower_views: numberOr(userTypeBreakdown.non_fan),
    };
  } catch (err) {
    const apiError = err.response?.data?.error;
    logger.debug(`FB page insights skipped for account ${account.id}: ${apiError?.message || err.message}`);
    return null;
  }
}

async function fetchInstagramInsights(account, token, day) {
  // IG Business accounts: profile_views, accounts_engaged, reach are the
  // closest matches. Reach is `reach` with metric_type=total_value.
  // accounts_engaged is the new name for the old engagement count.
  try {
    const since = Math.floor(new Date(day).getTime() / 1000);
    const until = since + 86400;
    const { data } = await axios.get(`${ig.IG_GRAPH_URL}/${account.platform_account_id}/insights`, {
      params: {
        metric: 'profile_views,accounts_engaged,reach,website_clicks',
        period: 'day',
        metric_type: 'total_value',
        since, until,
        access_token: token,
      },
      timeout: 12000,
    });
    const items = data.data || [];
    const totalValue = (name) => {
      const entry = items.find(i => i.name === name);
      const v = entry?.total_value?.value;
      return (typeof v === 'number') ? v : null;
    };
    return {
      engaged_users:      totalValue('accounts_engaged'),
      profile_views:      totalValue('profile_views'),
      profile_taps:       totalValue('website_clicks'),
      reach_unique:       totalValue('reach'),
      follower_views:     null,
      non_follower_views: null,
    };
  } catch (err) {
    const apiError = err.response?.data?.error;
    logger.debug(`IG insights skipped for account ${account.id}: ${apiError?.message || err.message}`);
    return null;
  }
}

// YouTube Analytics API — daily channel metrics. Needs the
// yt-analytics.readonly scope; older grants without it will get a
// 403 and we'll log + skip silently.
async function fetchYouTubeInsights(account, token, day) {
  try {
    const { data } = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
      params: {
        ids: 'channel==MINE',
        startDate: day,
        endDate: day,
        metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares',
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    // YouTube Analytics returns columnHeaders + rows. With a single
    // day range we expect 0 or 1 row.
    const headers = (data.columnHeaders || []).map(h => h.name);
    const row = (data.rows && data.rows[0]) || [];
    const get = (col) => {
      const idx = headers.indexOf(col);
      const v = idx >= 0 ? row[idx] : null;
      return (typeof v === 'number') ? v : null;
    };
    return {
      // estimatedMinutesWatched → seconds for parity with FB watch time.
      engaged_users:      null, // YouTube doesn't have a direct engaged_users equivalent
      profile_views:      get('views'),
      profile_taps:       null,
      reach_unique:       null, // YouTube doesn't expose reach
      follower_views:     null,
      non_follower_views: null,
    };
  } catch (err) {
    const apiError = err.response?.data?.error;
    logger.debug(`YouTube insights skipped for account ${account.id}: ${apiError?.message || err.message}`);
    return null;
  }
}

// LinkedIn organizationPageStatistics — needs r_organization_social
// scope (Marketing Developer Platform approval). With the current
// member-only OIDC grants this will 403 and we skip.
async function fetchLinkedInInsights(account, token, day) {
  try {
    // platform_account_id stores the organization URN id (numeric).
    const orgUrn = `urn:li:organization:${account.platform_account_id}`;
    const { data } = await axios.get(`${linkedin.LINKEDIN_API_BASE}/rest/organizationPageStatistics`, {
      params: {
        q: 'organization',
        organization: orgUrn,
        'timeIntervals.timeGranularityType': 'DAY',
        'timeIntervals.timeRange.start': new Date(day).getTime(),
        'timeIntervals.timeRange.end': new Date(nextDay(day)).getTime(),
      },
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 12000,
    });
    const stats = data.elements?.[0]?.totalPageStatistics || {};
    const views = stats.views || {};
    const clicks = stats.clicks || {};
    return {
      engaged_users:      null,
      profile_views:      numberOr(views.allPageViews?.pageViews),
      profile_taps:       numberOr(clicks.totalCareersClicks ?? clicks.totalLifePageClicks),
      reach_unique:       null,
      follower_views:     null,
      non_follower_views: null,
    };
  } catch (err) {
    const apiError = err.response?.data;
    logger.debug(`LinkedIn insights skipped for account ${account.id}: ${apiError?.message || err.message}`);
    return null;
  }
}

async function recordSnapshot(socialAccountId, day, values) {
  if (!values) return false;
  await pool.execute(
    `INSERT INTO channel_insights_daily
       (social_account_id, snapshot_date, engaged_users, profile_views, profile_taps, follower_views, non_follower_views, reach_unique)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       engaged_users      = VALUES(engaged_users),
       profile_views      = VALUES(profile_views),
       profile_taps       = VALUES(profile_taps),
       follower_views     = VALUES(follower_views),
       non_follower_views = VALUES(non_follower_views),
       reach_unique       = VALUES(reach_unique)`,
    [
      socialAccountId, day,
      n(values.engaged_users), n(values.profile_views), n(values.profile_taps),
      n(values.follower_views), n(values.non_follower_views), n(values.reach_unique),
    ]
  );
  return true;
}

function yesterday() {
  const d = new Date(Date.now() - 86400000);
  return d.toISOString().slice(0, 10);
}
function nextDay(d) {
  const t = new Date(d).getTime() + 86400000;
  return new Date(t).toISOString().slice(0, 10);
}
function numberOr(v) { return (typeof v === 'number') ? v : null; }
function n(v) { return (v === undefined || v === null) ? null : Number(v); }

module.exports = { fetchInsightsForAccount, recordSnapshot };
