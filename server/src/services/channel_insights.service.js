const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const ig = require('../config/instagram');
const linkedin = require('../config/linkedin');
const tw = require('../config/twitter');
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
  if (account.platform === 'twitter') {
    return fetchTwitterInsights(account, token, day);
  }
  return null;
}

async function fetchTwitterInsights(account, token, day) {
  try {
    const { data } = await axios.get(`${tw.TWITTER_API_BASE}/users/me`, {
      params: { 'user.fields': 'public_metrics' },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000,
    });
    const m = data.data?.public_metrics || {};
    return {
      // X snapshot fields fill the X-specific columns; everything else
      // stays null because /users/me doesn't report engagement etc.
      following_count: numberOr(m.following_count),
      tweet_count:     numberOr(m.tweet_count),
      listed_count:    numberOr(m.listed_count),
    };
  } catch (err) {
    const apiBody = err.response?.data;
    logger.debug(`X insights skipped for account ${account.id}: ${apiBody?.title || err.message}`);
    return null;
  }
}

async function fetchFacebookPageInsights(account, token, day) {
  // Meta's /insights endpoint takes a comma-separated metric list; we
  // batch the whole set into one call. Individual metrics that fail
  // (deprecated, gated behind a higher access tier, etc.) come back as
  // missing entries — valueOf returns null and the column stays NULL.
  const metrics = [
    'page_engaged_users',
    'page_views_total',
    'page_total_actions',
    'page_impressions_unique',
    'page_impressions_by_user_type',
    // Video
    'page_video_views',
    'page_video_views_unique',
    'page_video_view_time',
    'page_video_repeat_views',
    // Impressions breakdown
    'page_impressions_organic_v2',
    'page_impressions_paid',
    'page_impressions_viral_unique',
    'page_impressions_nonviral_unique',
    // Reach breakdown
    'page_impressions_organic_unique',
    'page_impressions_viral_unique',
    'page_impressions_nonviral_unique',
    // Fan source — these return { paid, unpaid } breakdowns
    'page_fans_by_like_source',
    // Engage subtypes
    'page_messages_blocked_conversations_unique',
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
    const breakdownOf = (name) => {
      const entry = items.find(i => i.name === name);
      const v = entry?.values?.[0]?.value;
      return (v && typeof v === 'object') ? v : {};
    };
    const userTypeBreakdown = breakdownOf('page_impressions_by_user_type');
    const likeSource = breakdownOf('page_fans_by_like_source');
    // like_source object shape varies by FB rollout — we sum any keys
    // whose name contains 'ad' as "paid", everything else as "unpaid".
    let paidFansAdded = 0, unpaidFansAdded = 0;
    for (const [key, count] of Object.entries(likeSource)) {
      if (typeof count !== 'number') continue;
      if (/ad/i.test(key)) paidFansAdded += count;
      else                 unpaidFansAdded += count;
    }
    // Visitor posts + ratings — both endpoints take since/until in unix
    // seconds. We count items whose created_time lands inside the day.
    const fanPostsCount = await countFacebookCreations(account, token, day, 'visitor_posts');
    const reviewsCount  = await countFacebookCreations(account, token, day, 'ratings');
    return {
      engaged_users:        valueOf('page_engaged_users'),
      profile_views:        valueOf('page_views_total'),
      profile_taps:         valueOf('page_total_actions'),
      reach_unique:         valueOf('page_impressions_unique'),
      follower_views:       numberOr(userTypeBreakdown.fan),
      non_follower_views:   numberOr(userTypeBreakdown.non_fan),
      video_views:          valueOf('page_video_views'),
      video_views_unique:   valueOf('page_video_views_unique'),
      video_view_time:      valueOf('page_video_view_time'),
      video_repeat_views:   valueOf('page_video_repeat_views'),
      impressions_organic:  valueOf('page_impressions_organic_v2'),
      impressions_paid:     valueOf('page_impressions_paid'),
      impressions_viral:    valueOf('page_impressions_viral_unique'),
      impressions_nonviral: valueOf('page_impressions_nonviral_unique'),
      reach_organic:        valueOf('page_impressions_organic_unique'),
      reach_viral:          valueOf('page_impressions_viral_unique'),
      reach_nonviral:       valueOf('page_impressions_nonviral_unique'),
      paid_fans_added:      Object.keys(likeSource).length ? paidFansAdded   : null,
      unpaid_fans_added:    Object.keys(likeSource).length ? unpaidFansAdded : null,
      blocked_dm_count:     valueOf('page_messages_blocked_conversations_unique'),
      fan_posts_count:      fanPostsCount,
      reviews_count:        reviewsCount,
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
    // Story replies + shares — sum over every active story for the
    // account. Stories expire after 24h so the cron has to run daily
    // for these totals to be meaningful.
    const storyTotals = await fetchInstagramStoryTotals(account, token);
    return {
      engaged_users:      totalValue('accounts_engaged'),
      profile_views:      totalValue('profile_views'),
      profile_taps:       totalValue('website_clicks'),
      reach_unique:       totalValue('reach'),
      follower_views:     null,
      non_follower_views: null,
      story_replies:      storyTotals?.replies,
      story_shares:       storyTotals?.shares,
    };
  } catch (err) {
    const apiError = err.response?.data?.error;
    logger.debug(`IG insights skipped for account ${account.id}: ${apiError?.message || err.message}`);
    return null;
  }
}

// Count items on /{page-id}/{endpoint} whose created_time lands inside
// the snapshot day. Used for visitor_posts (Fan posts metric) and
// ratings (Reviews metric). Returns null when the API rejects the
// call (deprecated endpoint, insufficient scope, etc.) so the column
// stays NULL rather than 0.
async function countFacebookCreations(account, token, day, endpoint) {
  const since = Math.floor(new Date(day).getTime() / 1000);
  const until = since + 86400;
  try {
    let url = `${fb.FB_GRAPH_URL}/${account.platform_account_id}/${endpoint}`;
    let params = { fields: 'created_time', since, until, limit: 100, access_token: token };
    let count = 0;
    let safety = 5; // cap pagination at 500 items per day
    while (url && safety-- > 0) {
      const { data } = await axios.get(url, { params, timeout: 10000 });
      count += (data?.data || []).length;
      const next = data?.paging?.next;
      if (!next) break;
      url = next;
      params = undefined;
    }
    return count;
  } catch (err) {
    logger.debug(`FB ${endpoint} skipped for account ${account.id}: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
}

// Sum replies + shares across every active story for the account.
// /me/stories returns up to ~50 active stories (24h lifetime). For
// each one we hit /{story_id}/insights with the standard set; the
// figures bubble up as the totals we store on the daily row.
async function fetchInstagramStoryTotals(account, token) {
  let replies = 0;
  let shares = 0;
  let hadAny = false;
  try {
    const { data } = await axios.get(`${ig.IG_GRAPH_URL}/${account.platform_account_id}/stories`, {
      params: { fields: 'id', access_token: token, limit: 50 },
      timeout: 10000,
    });
    const stories = data?.data || [];
    for (const s of stories) {
      try {
        const { data: ins } = await axios.get(`${ig.IG_GRAPH_URL}/${s.id}/insights`, {
          params: { metric: 'replies,shares', access_token: token },
          timeout: 8000,
        });
        const items = ins?.data || [];
        const valueOf = (name) => {
          const it = items.find(i => i.name === name);
          const v = it?.values?.[0]?.value;
          return (typeof v === 'number') ? v : 0;
        };
        replies += valueOf('replies');
        shares  += valueOf('shares');
        hadAny = true;
      } catch (innerErr) {
        // Individual story insights can fail on very fresh / expired
        // stories — skip and keep summing the others.
      }
    }
  } catch (err) {
    logger.debug(`IG stories skipped for account ${account.id}: ${err.response?.data?.error?.message || err.message}`);
    return null;
  }
  return hadAny ? { replies, shares } : null;
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
        metrics: 'views,estimatedMinutesWatched,subscribersGained,subscribersLost,likes,comments,shares,averageViewDuration,videosAddedToPlaylists',
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    const headers = (data.columnHeaders || []).map(h => h.name);
    const row = (data.rows && data.rows[0]) || [];
    const get = (col) => {
      const idx = headers.indexOf(col);
      const v = idx >= 0 ? row[idx] : null;
      return (typeof v === 'number') ? v : null;
    };
    return {
      engaged_users:        null,
      profile_views:        get('views'),
      profile_taps:         null,
      reach_unique:         null,
      follower_views:       null,
      non_follower_views:   null,
      // YouTube Analytics gives us channel-level video metrics that map
      // cleanly to our video_* columns. estimatedMinutesWatched is in
      // minutes — convert to seconds for parity with FB watch time.
      video_views:          get('views'),
      video_views_unique:   null, // YT doesn't expose unique viewers via Analytics
      video_view_time:      get('estimatedMinutesWatched') != null ? Math.round(get('estimatedMinutesWatched') * 60) : null,
      video_repeat_views:   null,
      impressions_organic:  null,
      impressions_paid:     null,
      impressions_viral:    null,
      impressions_nonviral: null,
      reach_organic:        null,
      reach_viral:          null,
      reach_nonviral:       null,
      paid_fans_added:      null,
      unpaid_fans_added:    null,
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

    // organic/paid follower gain breakdown — separate endpoint.
    let organicGain = null, paidGain = null;
    try {
      const orgUrn = `urn:li:organization:${account.platform_account_id}`;
      const { data: fg } = await axios.get(`${linkedin.LINKEDIN_API_BASE}/rest/organizationalEntityFollowerStatistics`, {
        params: {
          q: 'organizationalEntity',
          organizationalEntity: orgUrn,
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
      const el0 = fg.elements?.[0];
      // followerGains shape: { organicFollowerGain, paidFollowerGain }
      const gains = el0?.followerGains || {};
      organicGain = numberOr(gains.organicFollowerGain);
      paidGain    = numberOr(gains.paidFollowerGain);
    } catch (innerErr) {
      logger.debug(`LinkedIn follower gain skipped for account ${account.id}: ${innerErr.response?.data?.message || innerErr.message}`);
    }

    return {
      engaged_users:         null,
      profile_views:         numberOr(views.allPageViews?.pageViews),
      profile_taps:          numberOr(clicks.totalCareersClicks ?? clicks.totalLifePageClicks),
      reach_unique:          null,
      follower_views:        null,
      non_follower_views:    null,
      linkedin_organic_gain: organicGain,
      linkedin_paid_gain:    paidGain,
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
       (social_account_id, snapshot_date,
        engaged_users, profile_views, profile_taps,
        follower_views, non_follower_views, reach_unique,
        video_views, video_views_unique, video_view_time, video_repeat_views,
        impressions_organic, impressions_paid, impressions_viral, impressions_nonviral,
        reach_organic, reach_viral, reach_nonviral,
        paid_fans_added, unpaid_fans_added,
        following_count, tweet_count, listed_count,
        story_replies, story_shares,
        fan_posts_count, reviews_count, blocked_dm_count,
        linkedin_organic_gain, linkedin_paid_gain)
     VALUES (?, ?,
             ?, ?, ?,
             ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?,
             ?, ?,
             ?, ?, ?,
             ?, ?,
             ?, ?, ?,
             ?, ?)
     ON DUPLICATE KEY UPDATE
       engaged_users        = VALUES(engaged_users),
       profile_views        = VALUES(profile_views),
       profile_taps         = VALUES(profile_taps),
       follower_views       = VALUES(follower_views),
       non_follower_views   = VALUES(non_follower_views),
       reach_unique         = VALUES(reach_unique),
       video_views          = VALUES(video_views),
       video_views_unique   = VALUES(video_views_unique),
       video_view_time      = VALUES(video_view_time),
       video_repeat_views   = VALUES(video_repeat_views),
       impressions_organic  = VALUES(impressions_organic),
       impressions_paid     = VALUES(impressions_paid),
       impressions_viral    = VALUES(impressions_viral),
       impressions_nonviral = VALUES(impressions_nonviral),
       reach_organic        = VALUES(reach_organic),
       reach_viral          = VALUES(reach_viral),
       reach_nonviral       = VALUES(reach_nonviral),
       paid_fans_added      = VALUES(paid_fans_added),
       unpaid_fans_added    = VALUES(unpaid_fans_added),
       following_count      = VALUES(following_count),
       tweet_count          = VALUES(tweet_count),
       listed_count         = VALUES(listed_count),
       story_replies        = VALUES(story_replies),
       story_shares         = VALUES(story_shares),
       fan_posts_count      = VALUES(fan_posts_count),
       reviews_count        = VALUES(reviews_count),
       blocked_dm_count     = VALUES(blocked_dm_count),
       linkedin_organic_gain= VALUES(linkedin_organic_gain),
       linkedin_paid_gain   = VALUES(linkedin_paid_gain)`,
    [
      socialAccountId, day,
      n(values.engaged_users), n(values.profile_views), n(values.profile_taps),
      n(values.follower_views), n(values.non_follower_views), n(values.reach_unique),
      n(values.video_views), n(values.video_views_unique), n(values.video_view_time), n(values.video_repeat_views),
      n(values.impressions_organic), n(values.impressions_paid), n(values.impressions_viral), n(values.impressions_nonviral),
      n(values.reach_organic), n(values.reach_viral), n(values.reach_nonviral),
      n(values.paid_fans_added), n(values.unpaid_fans_added),
      n(values.following_count), n(values.tweet_count), n(values.listed_count),
      n(values.story_replies), n(values.story_shares),
      n(values.fan_posts_count), n(values.reviews_count), n(values.blocked_dm_count),
      n(values.linkedin_organic_gain), n(values.linkedin_paid_gain),
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
