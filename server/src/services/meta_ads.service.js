const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const { encrypt, decrypt } = require('./token.service');
const logger = require('../utils/logger');

// ── Connect: fetch ad accounts available to this user token ──

async function fetchAndStoreAdAccounts(userAccessToken, userId, teamId) {
  let data;
  try {
    const resp = await axios.get(`${fb.FB_GRAPH_URL}/me/adaccounts`, {
      params: {
        access_token: userAccessToken,
        fields: 'id,account_id,name,currency,timezone_name,account_status,business{id,name}',
        limit: 100,
      },
    });
    data = resp.data;
  } catch (err) {
    logger.warn(`Meta Ads: could not fetch ad accounts: ${err.response?.data?.error?.message || err.message}`);
    return [];
  }

  const accounts = [];
  const encryptedToken = encrypt(userAccessToken);

  for (const acct of data.data || []) {
    // Graph returns `id` like "act_123..."; account_id is just the numeric.
    const platformId = acct.id; // keep "act_" prefix for Marketing API calls
    await pool.execute(
      `INSERT INTO meta_ad_accounts
         (platform_account_id, name, currency, timezone_name, account_status,
          business_id, business_name, access_token, connected_by, team_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         currency = VALUES(currency),
         timezone_name = VALUES(timezone_name),
         account_status = VALUES(account_status),
         business_id = VALUES(business_id),
         business_name = VALUES(business_name),
         access_token = VALUES(access_token),
         is_active = 1`,
      [
        platformId,
        acct.name || platformId,
        acct.currency || null,
        acct.timezone_name || null,
        acct.account_status != null ? Number(acct.account_status) : null,
        acct.business?.id || null,
        acct.business?.name || null,
        encryptedToken,
        userId,
        teamId || null,
      ]
    );
    accounts.push({ id: platformId, name: acct.name });
  }

  logger.info(`Meta Ads: connected ${accounts.length} ad account(s) for user ${userId}`);
  return accounts;
}

// ── Sync: campaigns + insights per ad account ──

async function syncAdAccount(adAccountRow) {
  const token = decrypt(adAccountRow.access_token);
  const platformId = adAccountRow.platform_account_id;

  // 1. Pull campaigns
  let campaignsResp;
  try {
    campaignsResp = await axios.get(`${fb.FB_GRAPH_URL}/${platformId}/campaigns`, {
      params: {
        access_token: token,
        fields: 'id,name,objective,status,effective_status,daily_budget,lifetime_budget,start_time,stop_time,created_time,updated_time',
        limit: 200,
      },
    });
  } catch (err) {
    throw new Error(`campaigns fetch failed: ${err.response?.data?.error?.message || err.message}`);
  }

  const campaigns = campaignsResp.data?.data || [];
  const currency = adAccountRow.currency;

  // Upsert each campaign, build id map (platform_campaign_id -> local id)
  const platformToLocalCampaign = new Map();
  for (const c of campaigns) {
    await pool.execute(
      `INSERT INTO meta_campaigns
         (ad_account_id, platform_campaign_id, name, objective, status, effective_status,
          daily_budget, lifetime_budget, budget_currency, start_time, stop_time, created_time, updated_time)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         objective = VALUES(objective),
         status = VALUES(status),
         effective_status = VALUES(effective_status),
         daily_budget = VALUES(daily_budget),
         lifetime_budget = VALUES(lifetime_budget),
         budget_currency = VALUES(budget_currency),
         start_time = VALUES(start_time),
         stop_time = VALUES(stop_time),
         updated_time = VALUES(updated_time),
         last_synced_at = CURRENT_TIMESTAMP`,
      [
        adAccountRow.id,
        c.id,
        c.name || c.id,
        c.objective || null,
        c.status || null,
        c.effective_status || null,
        c.daily_budget ? Number(c.daily_budget) / 100 : null, // Meta returns minor units
        c.lifetime_budget ? Number(c.lifetime_budget) / 100 : null,
        currency,
        c.start_time ? new Date(c.start_time) : null,
        c.stop_time ? new Date(c.stop_time) : null,
        c.created_time ? new Date(c.created_time) : null,
        c.updated_time ? new Date(c.updated_time) : null,
      ]
    );
    const [rows] = await pool.execute(
      'SELECT id FROM meta_campaigns WHERE platform_campaign_id = ?',
      [c.id]
    );
    if (rows[0]) platformToLocalCampaign.set(c.id, rows[0].id);
  }

  // 2. Pull daily account-level insights (last 30 days)
  await fetchAndStoreInsights(adAccountRow, token, 'account', null);

  // 3. Pull daily campaign-level insights (last 30 days)
  for (const c of campaigns) {
    const localId = platformToLocalCampaign.get(c.id);
    if (!localId) continue;
    try {
      await fetchAndStoreInsights(adAccountRow, token, 'campaign', { campaignId: c.id, localCampaignId: localId });
    } catch (err) {
      logger.warn(`Meta Ads: campaign insight fetch failed for ${c.id}: ${err.message}`);
    }
  }

  await pool.execute(
    'UPDATE meta_ad_accounts SET last_synced_at = NOW() WHERE id = ?',
    [adAccountRow.id]
  );

  return { campaigns: campaigns.length };
}

async function fetchAndStoreInsights(adAccountRow, token, level, opts) {
  const platformId = adAccountRow.platform_account_id;
  const insightTarget = level === 'account' ? platformId : opts.campaignId;

  const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${insightTarget}/insights`, {
    params: {
      access_token: token,
      level: level === 'account' ? 'account' : 'campaign',
      fields: 'spend,impressions,reach,clicks,unique_clicks,ctr,cpc,cpm,frequency,actions,action_values',
      time_increment: 1,
      date_preset: 'last_30d',
    },
  });

  for (const row of data?.data || []) {
    const { conversions, conversionValue } = extractConversions(row);
    const spend = row.spend != null ? Number(row.spend) : 0;
    const roas = (conversionValue > 0 && spend > 0) ? Number((conversionValue / spend).toFixed(4)) : null;

    await pool.execute(
      `INSERT INTO meta_ad_insights
         (ad_account_id, campaign_id, level, date_start,
          spend, impressions, reach, clicks, unique_clicks,
          ctr, cpc, cpm, frequency, conversions, conversion_value, roas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         spend = VALUES(spend),
         impressions = VALUES(impressions),
         reach = VALUES(reach),
         clicks = VALUES(clicks),
         unique_clicks = VALUES(unique_clicks),
         ctr = VALUES(ctr),
         cpc = VALUES(cpc),
         cpm = VALUES(cpm),
         frequency = VALUES(frequency),
         conversions = VALUES(conversions),
         conversion_value = VALUES(conversion_value),
         roas = VALUES(roas),
         fetched_at = CURRENT_TIMESTAMP`,
      [
        adAccountRow.id,
        level === 'campaign' ? opts.localCampaignId : null,
        level,
        row.date_start,
        spend,
        row.impressions != null ? Number(row.impressions) : 0,
        row.reach != null ? Number(row.reach) : 0,
        row.clicks != null ? Number(row.clicks) : 0,
        row.unique_clicks != null ? Number(row.unique_clicks) : 0,
        row.ctr != null ? Number(row.ctr) : null,
        row.cpc != null ? Number(row.cpc) : null,
        row.cpm != null ? Number(row.cpm) : null,
        row.frequency != null ? Number(row.frequency) : null,
        conversions,
        conversionValue,
      ]
    );
  }
}

// Meta returns conversions inside an `actions` array of {action_type, value};
// `action_values` mirrors that with the monetary value. We sum the "purchase"
// flavours to get a first-pass conversions/ROAS without forcing the user to
// configure custom events. Tune later.
function extractConversions(row) {
  let conversions = 0;
  let conversionValue = 0;
  const TARGETS = new Set([
    'purchase',
    'offsite_conversion.fb_pixel_purchase',
    'omni_purchase',
    'web_in_store_purchase',
  ]);
  for (const a of row.actions || []) {
    if (TARGETS.has(a.action_type)) conversions += Number(a.value || 0);
  }
  for (const av of row.action_values || []) {
    if (TARGETS.has(av.action_type)) conversionValue += Number(av.value || 0);
  }
  return { conversions, conversionValue };
}

// ── Reads exposed to the API layer ──

async function listAccounts({ clientId }) {
  const params = [];
  let where = 'aa.is_active = 1';
  if (clientId) {
    // Show accounts assigned to this client AND unassigned ones, so users
    // can see and triage newly-discovered accounts without needing to
    // switch to "All clients" first.
    where += ' AND (aa.client_id = ? OR aa.client_id IS NULL)';
    params.push(clientId);
  }
  const [rows] = await pool.execute(
    `SELECT aa.id, aa.platform_account_id, aa.name, aa.currency, aa.timezone_name,
            aa.account_status, aa.business_id, aa.business_name, aa.client_id,
            aa.last_synced_at, aa.created_at,
            c.name AS client_name, c.color AS client_color
     FROM meta_ad_accounts aa
     LEFT JOIN clients c ON aa.client_id = c.id
     WHERE ${where}
     ORDER BY aa.name ASC`,
    params
  );
  return rows.map(formatAccount);
}

async function getOverview({ clientId, start, end, days = 30 }) {
  // Resolve start/end. Explicit dates win; otherwise fall back to last `days` days.
  if (!start || !end) {
    const e = new Date();
    const s = new Date(e.getTime() - days * 24 * 60 * 60 * 1000);
    start = s.toISOString().slice(0, 10);
    end = e.toISOString().slice(0, 10);
  }

  const params = [start, end];
  let scopeJoin = '';
  let scopeWhere = '';
  if (clientId) {
    scopeJoin = 'JOIN meta_ad_accounts aa ON i.ad_account_id = aa.id';
    scopeWhere = 'AND aa.client_id = ?';
    params.push(clientId);
  }

  const [totals] = await pool.execute(
    `SELECT
       COALESCE(SUM(i.spend), 0) AS spend,
       COALESCE(SUM(i.impressions), 0) AS impressions,
       COALESCE(SUM(i.reach), 0) AS reach,
       COALESCE(SUM(i.clicks), 0) AS clicks,
       COALESCE(SUM(i.conversions), 0) AS conversions,
       COALESCE(SUM(i.conversion_value), 0) AS conversion_value
     FROM meta_ad_insights i
     ${scopeJoin}
     WHERE i.level = 'account'
       AND i.date_start BETWEEN ? AND ?
       ${scopeWhere}`,
    params
  );

  const [daily] = await pool.execute(
    `SELECT i.date_start AS date,
            SUM(i.spend) AS spend,
            SUM(i.impressions) AS impressions,
            SUM(i.clicks) AS clicks,
            SUM(i.conversion_value) AS conversion_value
     FROM meta_ad_insights i
     ${scopeJoin}
     WHERE i.level = 'account'
       AND i.date_start BETWEEN ? AND ?
       ${scopeWhere}
     GROUP BY i.date_start
     ORDER BY i.date_start ASC`,
    params
  );

  const campaignParams = clientId ? [start, end, clientId] : [start, end];
  const [topCampaigns] = await pool.execute(
    `SELECT camp.id, camp.platform_campaign_id, camp.name, camp.objective, camp.effective_status,
            camp.budget_currency, camp.daily_budget, camp.lifetime_budget,
            aa2.name AS account_name, aa2.id AS ad_account_id,
            SUM(i.spend) AS spend, SUM(i.impressions) AS impressions, SUM(i.clicks) AS clicks,
            SUM(i.conversions) AS conversions, SUM(i.conversion_value) AS conversion_value
     FROM meta_campaigns camp
     JOIN meta_ad_accounts aa2 ON camp.ad_account_id = aa2.id
     LEFT JOIN meta_ad_insights i
       ON i.campaign_id = camp.id
       AND i.level = 'campaign'
       AND i.date_start BETWEEN ? AND ?
     WHERE 1=1 ${clientId ? 'AND aa2.client_id = ?' : ''}
     GROUP BY camp.id
     ORDER BY spend DESC, camp.name ASC
     LIMIT 25`,
    campaignParams
  );

  const t = totals[0] || {};
  const spend = Number(t.spend) || 0;
  const conversionValue = Number(t.conversion_value) || 0;
  return {
    summary: {
      spend,
      impressions: Number(t.impressions) || 0,
      reach: Number(t.reach) || 0,
      clicks: Number(t.clicks) || 0,
      conversions: Number(t.conversions) || 0,
      conversionValue,
      ctr: t.impressions > 0 ? (t.clicks / t.impressions) * 100 : 0,
      cpc: t.clicks > 0 ? spend / t.clicks : 0,
      cpm: t.impressions > 0 ? (spend / t.impressions) * 1000 : 0,
      roas: spend > 0 ? conversionValue / spend : 0,
    },
    daily: daily.map(d => ({
      date: d.date,
      spend: Number(d.spend) || 0,
      impressions: Number(d.impressions) || 0,
      clicks: Number(d.clicks) || 0,
      conversionValue: Number(d.conversion_value) || 0,
    })),
    topCampaigns: topCampaigns.map(c => {
      const cSpend = Number(c.spend) || 0;
      return {
        id: c.id,
        platformCampaignId: c.platform_campaign_id,
        name: c.name,
        objective: c.objective,
        effectiveStatus: c.effective_status,
        currency: c.budget_currency,
        dailyBudget: c.daily_budget != null ? Number(c.daily_budget) : null,
        lifetimeBudget: c.lifetime_budget != null ? Number(c.lifetime_budget) : null,
        accountId: c.ad_account_id,
        accountName: c.account_name,
        spend: cSpend,
        impressions: Number(c.impressions) || 0,
        clicks: Number(c.clicks) || 0,
        conversions: Number(c.conversions) || 0,
        conversionValue: Number(c.conversion_value) || 0,
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        cpc: c.clicks > 0 ? cSpend / c.clicks : 0,
        roas: cSpend > 0 ? (Number(c.conversion_value) || 0) / cSpend : 0,
      };
    }),
  };
}

async function listCampaigns({ adAccountId, clientId }) {
  const params = [];
  let where = '1=1';
  if (adAccountId) { where += ' AND camp.ad_account_id = ?'; params.push(adAccountId); }
  if (clientId)    { where += ' AND aa.client_id = ?';        params.push(clientId); }

  const [rows] = await pool.execute(
    `SELECT camp.*, aa.name AS account_name, aa.currency,
            (SELECT SUM(i.spend) FROM meta_ad_insights i
              WHERE i.campaign_id = camp.id AND i.level = 'campaign'
                AND i.date_start >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS spend_30d,
            (SELECT SUM(i.impressions) FROM meta_ad_insights i
              WHERE i.campaign_id = camp.id AND i.level = 'campaign'
                AND i.date_start >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS impressions_30d,
            (SELECT SUM(i.clicks) FROM meta_ad_insights i
              WHERE i.campaign_id = camp.id AND i.level = 'campaign'
                AND i.date_start >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)) AS clicks_30d
     FROM meta_campaigns camp
     JOIN meta_ad_accounts aa ON camp.ad_account_id = aa.id
     WHERE ${where}
     ORDER BY camp.updated_time DESC, camp.name ASC`,
    params
  );

  return rows.map(r => ({
    id: r.id,
    platformCampaignId: r.platform_campaign_id,
    adAccountId: r.ad_account_id,
    accountName: r.account_name,
    name: r.name,
    objective: r.objective,
    status: r.status,
    effectiveStatus: r.effective_status,
    dailyBudget: r.daily_budget != null ? Number(r.daily_budget) : null,
    lifetimeBudget: r.lifetime_budget != null ? Number(r.lifetime_budget) : null,
    currency: r.budget_currency || r.currency,
    startTime: r.start_time,
    stopTime: r.stop_time,
    spend30d: r.spend_30d != null ? Number(r.spend_30d) : 0,
    impressions30d: r.impressions_30d != null ? Number(r.impressions_30d) : 0,
    clicks30d: r.clicks_30d != null ? Number(r.clicks_30d) : 0,
  }));
}

async function assignAccountToClient(adAccountId, clientId) {
  await pool.execute(
    'UPDATE meta_ad_accounts SET client_id = ? WHERE id = ?',
    [clientId || null, adAccountId]
  );
}

async function disconnectAccount(adAccountId) {
  await pool.execute(
    'UPDATE meta_ad_accounts SET is_active = 0 WHERE id = ?',
    [adAccountId]
  );
}

async function syncAll() {
  const [accounts] = await pool.execute(
    'SELECT * FROM meta_ad_accounts WHERE is_active = 1'
  );
  let ok = 0, failed = 0;
  for (const acct of accounts) {
    try {
      await syncAdAccount(acct);
      ok++;
    } catch (e) {
      failed++;
      logger.error(`Meta Ads sync: account ${acct.id} failed: ${e.message}`);
    }
  }
  return { ok, failed, total: accounts.length };
}

async function syncOne(adAccountId) {
  const [rows] = await pool.execute(
    'SELECT * FROM meta_ad_accounts WHERE id = ? AND is_active = 1',
    [adAccountId]
  );
  if (rows.length === 0) throw Object.assign(new Error('Ad account not found'), { status: 404 });
  return syncAdAccount(rows[0]);
}

function formatAccount(r) {
  return {
    id: r.id,
    platformAccountId: r.platform_account_id,
    name: r.name,
    currency: r.currency,
    timezone: r.timezone_name,
    accountStatus: r.account_status,
    businessId: r.business_id,
    businessName: r.business_name,
    clientId: r.client_id,
    clientName: r.client_name,
    clientColor: r.client_color,
    lastSyncedAt: r.last_synced_at,
    createdAt: r.created_at,
  };
}

module.exports = {
  fetchAndStoreAdAccounts,
  syncAdAccount,
  syncAll,
  syncOne,
  listAccounts,
  listCampaigns,
  getOverview,
  assignAccountToClient,
  disconnectAccount,
};
