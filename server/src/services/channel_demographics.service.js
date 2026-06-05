const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const ig = require('../config/instagram');
const linkedin = require('../config/linkedin');
const { decrypt } = require('./token.service');
const logger = require('../utils/logger');

// Fetch audience demographics (country + gender/age) for one account
// and UPSERT each (dimension_key, count) into channel_demographics.
// Returns { stored, dimensions } so the cron can log progress.
async function snapshotDemographicsForAccount(account, dateStr) {
  const token = decrypt(account.access_token);
  const day = dateStr || todayStr();
  if (account.platform === 'facebook_page') {
    return fetchFacebookDemographics(account, token, day);
  }
  if (account.platform === 'instagram_business') {
    return fetchInstagramDemographics(account, token, day);
  }
  if (account.platform === 'youtube') {
    // YT has two snapshot calls — the audience demographics (country +
    // age/gender, lifetime) go through the same upsertDimensions path
    // as FB / IG; the per-day per-dimension YouTube Analytics rows
    // (country views / watch_time / engagements, sharing services,
    // traffic sources) go into the dedicated youtube_analytics_dimensions
    // table so the dashboard can render them via SUM(value) over a range.
    await snapshotYouTubeDimensions(account, token, day);
    return fetchYouTubeDemographics(account, token, day);
  }
  if (account.platform === 'linkedin') {
    return fetchLinkedInDemographics(account, token, day);
  }
  return { stored: 0, dimensions: [] };
}

async function fetchFacebookDemographics(account, token, day) {
  // page_fans_country + page_fans_gender_age are both stable metrics on
  // Page tokens with pages_read_engagement. Both return a single value
  // that's an object keyed by country code / gender_age slot.
  const metrics = ['page_fans_country', 'page_fans_gender_age'].join(',');
  let dims = [];
  try {
    const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${account.platform_account_id}/insights`, {
      params: { metric: metrics, period: 'lifetime', access_token: token },
      timeout: 12000,
    });
    const items = data.data || [];
    const country = items.find(i => i.name === 'page_fans_country')?.values?.[0]?.value || {};
    const gender  = items.find(i => i.name === 'page_fans_gender_age')?.values?.[0]?.value || {};
    dims = [
      ...Object.entries(country).map(([key, count]) => ({ dimension: 'country',    key, count })),
      ...Object.entries(gender ).map(([key, count]) => ({ dimension: 'gender_age', key, count })),
    ];
  } catch (err) {
    logger.debug(`FB demographics skipped for account ${account.id}: ${err.response?.data?.error?.message || err.message}`);
    return { stored: 0, dimensions: [] };
  }
  return upsertDimensions(account.id, day, dims);
}

async function fetchInstagramDemographics(account, token, day) {
  // IG uses follower_demographics with breakdowns. Two calls — country
  // and age — since IG doesn't return both in one breakdown set.
  const dims = [];
  try {
    const { data: cData } = await axios.get(`${ig.IG_GRAPH_URL}/${account.platform_account_id}/insights`, {
      params: { metric: 'follower_demographics', period: 'lifetime', breakdown: 'country', metric_type: 'total_value', access_token: token },
      timeout: 12000,
    });
    const cVals = cData?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
    for (const r of cVals) {
      const key = (r.dimension_values || [])[0];
      if (key && typeof r.value === 'number') dims.push({ dimension: 'country', key, count: r.value });
    }
  } catch (err) {
    logger.debug(`IG country demographics skipped for account ${account.id}: ${err.response?.data?.error?.message || err.message}`);
  }
  try {
    // IG returns age separately from gender — combine into our F.25-34 / M.18-24 keys.
    const { data: gData } = await axios.get(`${ig.IG_GRAPH_URL}/${account.platform_account_id}/insights`, {
      params: { metric: 'follower_demographics', period: 'lifetime', breakdown: 'age,gender', metric_type: 'total_value', access_token: token },
      timeout: 12000,
    });
    const gVals = gData?.data?.[0]?.total_value?.breakdowns?.[0]?.results || [];
    for (const r of gVals) {
      const [age, gender] = r.dimension_values || [];
      if (age && gender && typeof r.value === 'number') {
        // M (male), F (female), U (unknown) prefix
        const gPrefix = gender.startsWith('M') ? 'M' : gender.startsWith('F') ? 'F' : 'U';
        dims.push({ dimension: 'gender_age', key: `${gPrefix}.${age}`, count: r.value });
      }
    }
  } catch (err) {
    logger.debug(`IG gender_age demographics skipped for account ${account.id}: ${err.response?.data?.error?.message || err.message}`);
  }
  return upsertDimensions(account.id, day, dims);
}

// YouTube Analytics audience demographics. viewerPercentage is the
// percentage of total channel viewing time attributed to each
// dimension value — we multiply by the channel's reported total
// viewers to get an estimated head-count, otherwise rows would all
// be small floats. For lack of a reliable "total viewers" lifetime
// number we just store the percentage scaled by 100 so it's an
// integer the dashboard can render.
// YouTube Analytics per-day dimension fan-out. Stores rows in the new
// youtube_analytics_dimensions table. Called daily from the channel
// insights cron so the dashboard can render the six dimension widgets.
async function snapshotYouTubeDimensions(account, token, day) {
  let stored = 0;
  // Country dimension — pull views / subscribersGained / likes+comments+shares
  // / estimatedMinutesWatched in one call per metric set.
  try {
    const { data } = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
      params: {
        ids: 'channel==MINE',
        startDate: day,
        endDate: day,
        metrics: 'views,subscribersGained,likes,comments,shares,estimatedMinutesWatched',
        dimensions: 'country',
        sort: '-views',
        maxResults: 200,
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    const headers = (data.columnHeaders || []).map(h => h.name);
    for (const row of (data.rows || [])) {
      const country = row[headers.indexOf('country')];
      if (!country) continue;
      const inserts = [
        ['views',                 Number(row[headers.indexOf('views')])               || 0],
        ['subscribers_gained',    Number(row[headers.indexOf('subscribersGained')])   || 0],
        ['engagements',           (Number(row[headers.indexOf('likes')])    || 0)
                                + (Number(row[headers.indexOf('comments')]) || 0)
                                + (Number(row[headers.indexOf('shares')])   || 0)],
        ['watch_time_seconds',    Math.round((Number(row[headers.indexOf('estimatedMinutesWatched')]) || 0) * 60)],
      ];
      for (const [metricType, value] of inserts) {
        if (value === 0) continue;
        await pool.execute(
          `INSERT INTO youtube_analytics_dimensions
             (social_account_id, snapshot_date, dimension_type, dimension_key, metric_type, value)
           VALUES (?, ?, 'country', ?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          [account.id, day, country, metricType, value]
        );
        stored++;
      }
    }
  } catch (err) {
    logger.debug(`YouTube country dimensions skipped for ${account.id}: ${err.response?.data?.error?.message || err.message}`);
  }
  // Top traffic sources — views per insightTrafficSourceType.
  try {
    const { data } = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
      params: {
        ids: 'channel==MINE',
        startDate: day,
        endDate: day,
        metrics: 'views',
        dimensions: 'insightTrafficSourceType',
        sort: '-views',
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    const headers = (data.columnHeaders || []).map(h => h.name);
    for (const row of (data.rows || [])) {
      const sourceType = row[headers.indexOf('insightTrafficSourceType')];
      const views = Number(row[headers.indexOf('views')]) || 0;
      if (!sourceType || views === 0) continue;
      await pool.execute(
        `INSERT INTO youtube_analytics_dimensions
           (social_account_id, snapshot_date, dimension_type, dimension_key, metric_type, value)
         VALUES (?, ?, 'source', ?, 'views', ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [account.id, day, sourceType, views]
      );
      stored++;
    }
  } catch (err) {
    logger.debug(`YouTube source dimensions skipped for ${account.id}: ${err.response?.data?.error?.message || err.message}`);
  }
  // Sharing services — shares per sharingService.
  try {
    const { data } = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
      params: {
        ids: 'channel==MINE',
        startDate: day,
        endDate: day,
        metrics: 'shares',
        dimensions: 'sharingService',
        sort: '-shares',
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    const headers = (data.columnHeaders || []).map(h => h.name);
    for (const row of (data.rows || [])) {
      const service = row[headers.indexOf('sharingService')];
      const shares = Number(row[headers.indexOf('shares')]) || 0;
      if (!service || shares === 0) continue;
      await pool.execute(
        `INSERT INTO youtube_analytics_dimensions
           (social_account_id, snapshot_date, dimension_type, dimension_key, metric_type, value)
         VALUES (?, ?, 'sharing', ?, 'shares', ?)
         ON DUPLICATE KEY UPDATE value = VALUES(value)`,
        [account.id, day, service, shares]
      );
      stored++;
    }
  } catch (err) {
    logger.debug(`YouTube sharing dimensions skipped for ${account.id}: ${err.response?.data?.error?.message || err.message}`);
  }
  return stored;
}

async function fetchYouTubeDemographics(account, token, day) {
  const dims = [];
  // Country breakdown
  try {
    const { data } = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
      params: {
        ids: 'channel==MINE',
        startDate: '2005-01-01', // YT founding — lifetime aggregate
        endDate: day,
        metrics: 'viewerPercentage',
        dimensions: 'country',
        sort: '-viewerPercentage',
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    for (const row of (data.rows || [])) {
      const [code, pct] = row;
      if (code && typeof pct === 'number') {
        dims.push({ dimension: 'country', key: code, count: Math.round(pct * 100) });
      }
    }
  } catch (err) {
    logger.debug(`YouTube country demographics skipped for account ${account.id}: ${err.response?.data?.error?.message || err.message}`);
  }
  // Age + Gender
  try {
    const { data } = await axios.get('https://youtubeanalytics.googleapis.com/v2/reports', {
      params: {
        ids: 'channel==MINE',
        startDate: '2005-01-01',
        endDate: day,
        metrics: 'viewerPercentage',
        dimensions: 'ageGroup,gender',
      },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    for (const row of (data.rows || [])) {
      const [age, gender, pct] = row;
      if (age && gender && typeof pct === 'number') {
        // YouTube ages come as "age13-17", "age18-24" etc.
        const ageBracket = String(age).replace(/^age/, '');
        const g = gender === 'female' ? 'F' : gender === 'male' ? 'M' : 'U';
        dims.push({ dimension: 'gender_age', key: `${g}.${ageBracket}`, count: Math.round(pct * 100) });
      }
    }
  } catch (err) {
    logger.debug(`YouTube gender_age demographics skipped for account ${account.id}: ${err.response?.data?.error?.message || err.message}`);
  }
  return upsertDimensions(account.id, day, dims);
}

// LinkedIn organizationalEntityFollowerStatistics — country and
// staff_count_range. Needs r_organization_social scope (gated).
async function fetchLinkedInDemographics(account, token, day) {
  const dims = [];
  try {
    const orgUrn = `urn:li:organization:${account.platform_account_id}`;
    const { data } = await axios.get(`${linkedin.LINKEDIN_API_BASE}/rest/organizationalEntityFollowerStatistics`, {
      params: { q: 'organizationalEntity', organizationalEntity: orgUrn },
      headers: {
        Authorization: `Bearer ${token}`,
        'LinkedIn-Version': '202401',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      timeout: 12000,
    });
    const elements = data.elements || [];
    for (const el of elements) {
      // followerCountsByGeoCountry: [{ geo: 'urn:li:geo:...', followerCounts: { organicFollowerCount, paidFollowerCount } }]
      for (const c of (el.followerCountsByGeoCountry || [])) {
        const code = (c.geo || '').split(':').pop();
        const count = (c.followerCounts?.organicFollowerCount || 0) + (c.followerCounts?.paidFollowerCount || 0);
        if (code) dims.push({ dimension: 'country', key: code, count });
      }
    }
  } catch (err) {
    logger.debug(`LinkedIn demographics skipped for account ${account.id}: ${err.response?.data?.message || err.message}`);
  }
  return upsertDimensions(account.id, day, dims);
}

async function upsertDimensions(socialAccountId, day, dims) {
  if (dims.length === 0) return { stored: 0, dimensions: [] };
  let stored = 0;
  for (const d of dims) {
    await pool.execute(
      `INSERT INTO channel_demographics
         (social_account_id, snapshot_date, dimension, dimension_key, fans_count)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE fans_count = VALUES(fans_count)`,
      [socialAccountId, day, d.dimension, String(d.key).slice(0, 32), Number(d.count) || 0]
    );
    stored++;
  }
  return { stored, dimensions: dims };
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { snapshotDemographicsForAccount };
