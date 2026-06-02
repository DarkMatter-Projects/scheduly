const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const ig = require('../config/instagram');
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
