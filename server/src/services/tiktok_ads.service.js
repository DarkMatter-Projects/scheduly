const axios = require('axios');
const pool = require('../config/db');
const tt = require('../config/tiktok');
const { encrypt, decrypt } = require('./token.service');
const logger = require('../utils/logger');

// ── OAuth ─────────────────────────────────────────────────────────────────────

function getAuthUrl(state) {
  // TikTok uses non-standard OAuth: app_id (not client_id) and rid (not state)
  // is also accepted, but `state` works on the canonical /portal/auth endpoint.
  const params = new URLSearchParams({
    app_id: tt.appId,
    redirect_uri: tt.redirectUri,
    state,
    scope: tt.TIKTOK_SCOPES.join(','),
  });
  return `${tt.TIKTOK_OAUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  // TikTok's token endpoint takes JSON, not form-encoded.
  const { data } = await axios.post(
    `${tt.OAUTH_API_BASE}/oauth2/access_token/`,
    {
      app_id: tt.appId,
      secret: tt.appSecret,
      auth_code: code,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    }
  );

  if (data.code !== 0) {
    throw new Error(`TikTok token exchange failed (${data.code}): ${data.message}`);
  }
  const d = data.data || {};
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token || null,
    expiresIn: d.access_token_expire_time || d.expires_in || null,
    refreshExpiresIn: d.refresh_token_expire_time || null,
    advertiserIds: d.advertiser_ids || [],
    scope: d.scope || null,
    tiktokUserId: d.open_id || d.user_id || null,
    displayName: d.display_name || null,
  };
}

async function fetchUserInfo(accessToken) {
  // TikTok Marketing API doesn't have a generic /userinfo — we use the
  // open_id returned by the token exchange instead. This helper exists for
  // parity with Google but is best-effort.
  try {
    const { data } = await axios.get(`${tt.OAUTH_API_BASE}/user/info/`, {
      headers: { 'Access-Token': accessToken },
      timeout: 10000,
    });
    if (data.code === 0) return data.data || {};
  } catch (_) { /* ignore */ }
  return {};
}

async function storeGrant({ tokens, userId, teamId }) {
  const accessEnc = encrypt(tokens.accessToken);
  const refreshEnc = tokens.refreshToken ? encrypt(tokens.refreshToken) : null;
  const tiktokUserId = tokens.tiktokUserId || `tt_${userId}_${Date.now()}`;
  const accessExpiresAt = tokens.expiresIn
    ? new Date((tokens.expiresIn > 1e12 ? tokens.expiresIn : Date.now() + tokens.expiresIn * 1000))
    : null;
  const refreshExpiresAt = tokens.refreshExpiresIn
    ? new Date((tokens.refreshExpiresIn > 1e12 ? tokens.refreshExpiresIn : Date.now() + tokens.refreshExpiresIn * 1000))
    : null;

  const [result] = await pool.execute(
    `INSERT INTO tiktok_oauth_grants
       (user_id, team_id, tiktok_user_id, display_name,
        access_token, refresh_token, access_token_expires_at, refresh_token_expires_at, scopes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       access_token = VALUES(access_token),
       refresh_token = VALUES(refresh_token),
       access_token_expires_at = VALUES(access_token_expires_at),
       refresh_token_expires_at = VALUES(refresh_token_expires_at),
       scopes = VALUES(scopes),
       display_name = VALUES(display_name),
       is_active = 1`,
    [
      userId,
      teamId || null,
      String(tiktokUserId),
      tokens.displayName || null,
      accessEnc,
      refreshEnc,
      accessExpiresAt,
      refreshExpiresAt,
      tokens.scope || tt.TIKTOK_SCOPES.join(','),
    ]
  );

  let grantId = result.insertId;
  if (!grantId) {
    const [rows] = await pool.execute(
      'SELECT id FROM tiktok_oauth_grants WHERE user_id = ? AND tiktok_user_id = ?',
      [userId, String(tiktokUserId)]
    );
    grantId = rows[0]?.id;
  }
  return { grantId, advertiserIds: tokens.advertiserIds };
}

// ── Discovery ────────────────────────────────────────────────────────────────

function ttHeaders(accessToken) {
  return {
    'Access-Token': accessToken,
    'Content-Type': 'application/json',
  };
}

async function listAdvertisers(accessToken, advertiserIds) {
  // TikTok requires app_id + secret for /advertiser/get/, plus the access
  // token. Pass advertiser_ids if returned from token exchange to filter.
  const params = {
    app_id: tt.appId,
    secret: tt.appSecret,
  };
  const { data } = await axios.get(
    `${tt.OAUTH_API_BASE}/oauth2/advertiser/get/`,
    { params, headers: ttHeaders(accessToken), timeout: 15000 }
  );
  if (data.code !== 0) {
    throw new Error(`TikTok /advertiser/get/ failed (${data.code}): ${data.message}`);
  }
  return (data.data?.list || []).map(a => ({
    advertiserId: String(a.advertiser_id),
    advertiserName: a.advertiser_name,
  }));
}

async function describeAdvertiser(accessToken, advertiserId) {
  const params = { advertiser_ids: JSON.stringify([advertiserId]) };
  const { data } = await axios.get(
    `${tt.DATA_API_BASE}/advertiser/info/`,
    { params, headers: ttHeaders(accessToken), timeout: 15000 }
  );
  if (data.code !== 0) {
    logger.warn(`TikTok /advertiser/info/ for ${advertiserId} failed (${data.code}): ${data.message}`);
    return null;
  }
  return (data.data?.list || data.data || [])[0] || null;
}

async function discoverAccounts(grantId) {
  const [rows] = await pool.execute('SELECT * FROM tiktok_oauth_grants WHERE id = ?', [grantId]);
  if (rows.length === 0) throw Object.assign(new Error('Grant not found'), { status: 404 });
  const grant = rows[0];

  const accessToken = await getAccessTokenForGrant(grant);

  let advertisers;
  try {
    advertisers = await listAdvertisers(accessToken);
  } catch (e) {
    const msg = e.response?.data?.message || e.message;
    await pool.execute(
      'UPDATE tiktok_oauth_grants SET last_discover_error = ? WHERE id = ?',
      [String(msg).slice(0, 500), grantId]
    );
    throw new Error(`listAdvertisers failed: ${msg}`);
  }

  await pool.execute(
    'UPDATE tiktok_oauth_grants SET last_discover_error = NULL WHERE id = ?',
    [grantId]
  );

  const discovered = [];
  for (const a of advertisers) {
    let info = null;
    try { info = await describeAdvertiser(accessToken, a.advertiserId); } catch (_) {}
    const name = info?.name || info?.advertiser_name || a.advertiserName || `Advertiser ${a.advertiserId}`;
    const currency = info?.currency || null;
    const timezone = info?.timezone || null;
    const status = info?.status || null;

    await pool.execute(
      `INSERT INTO tiktok_ad_accounts
         (grant_id, advertiser_id, advertiser_name, currency, timezone, status, is_sandbox)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         grant_id = VALUES(grant_id),
         advertiser_name = VALUES(advertiser_name),
         currency = VALUES(currency),
         timezone = VALUES(timezone),
         status = VALUES(status),
         is_sandbox = VALUES(is_sandbox),
         is_active = 1`,
      [grantId, a.advertiserId, name, currency, timezone, status, tt.SANDBOX ? 1 : 0]
    );
    discovered.push({ advertiserId: a.advertiserId, name });
  }
  return discovered;
}

async function getAccessTokenForGrant(grant) {
  // TikTok long-lived access tokens last ~24h, refresh tokens ~365 days.
  // If access token is missing or expiring within 60s, refresh.
  const expiry = grant.access_token_expires_at ? new Date(grant.access_token_expires_at).getTime() : 0;
  if (grant.access_token && Date.now() < expiry - 60 * 1000) {
    return decrypt(grant.access_token);
  }
  if (!grant.refresh_token) {
    // No refresh token (older grant) — fall back to whatever access token is stored.
    return decrypt(grant.access_token);
  }

  const refreshPlain = decrypt(grant.refresh_token);
  const { data } = await axios.post(
    `${tt.OAUTH_API_BASE}/oauth2/refresh_token/`,
    { app_id: tt.appId, secret: tt.appSecret, refresh_token: refreshPlain },
    { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
  );
  if (data.code !== 0) {
    throw new Error(`TikTok token refresh failed (${data.code}): ${data.message}`);
  }
  const d = data.data || {};
  const newAccess = d.access_token;
  const newExpiry = d.access_token_expire_time
    ? new Date(d.access_token_expire_time > 1e12 ? d.access_token_expire_time : Date.now() + d.access_token_expire_time * 1000)
    : null;

  await pool.execute(
    `UPDATE tiktok_oauth_grants
        SET access_token = ?, access_token_expires_at = ?
      WHERE id = ?`,
    [encrypt(newAccess), newExpiry, grant.id]
  );
  return newAccess;
}

// ── Sync ─────────────────────────────────────────────────────────────────────

function isoDate(d) { return d.toISOString().slice(0, 10); }

async function syncAccount(accountRow) {
  const [grantRows] = await pool.execute(
    'SELECT * FROM tiktok_oauth_grants WHERE id = ?',
    [accountRow.grant_id]
  );
  if (grantRows.length === 0) throw new Error('Grant missing for ad account');
  const grant = grantRows[0];
  const accessToken = await getAccessTokenForGrant(grant);
  const advertiserId = accountRow.advertiser_id;

  // 1. Pull campaigns
  let campaignResp;
  try {
    campaignResp = await axios.get(
      `${tt.DATA_API_BASE}/campaign/get/`,
      {
        params: {
          advertiser_id: advertiserId,
          page: 1,
          page_size: 100,
        },
        headers: ttHeaders(accessToken),
        timeout: 30000,
      }
    );
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    await pool.execute(
      'UPDATE tiktok_ad_accounts SET sync_error = ? WHERE id = ?',
      [String(msg).slice(0, 500), accountRow.id]
    );
    throw new Error(`campaigns query failed: ${msg}`);
  }
  if (campaignResp.data.code !== 0) {
    const msg = campaignResp.data.message;
    await pool.execute(
      'UPDATE tiktok_ad_accounts SET sync_error = ? WHERE id = ?',
      [String(msg).slice(0, 500), accountRow.id]
    );
    throw new Error(`campaigns query failed: ${msg}`);
  }

  const campaigns = campaignResp.data.data?.list || [];
  const platformToLocal = new Map();
  for (const c of campaigns) {
    await pool.execute(
      `INSERT INTO tiktok_campaigns
         (ad_account_id, platform_campaign_id, name, status, objective_type,
          budget, budget_mode, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name),
         status = VALUES(status),
         objective_type = VALUES(objective_type),
         budget = VALUES(budget),
         budget_mode = VALUES(budget_mode),
         start_date = VALUES(start_date),
         end_date = VALUES(end_date),
         last_synced_at = CURRENT_TIMESTAMP`,
      [
        accountRow.id,
        String(c.campaign_id),
        c.campaign_name || String(c.campaign_id),
        c.operation_status || c.status || null,
        c.objective_type || null,
        c.budget != null ? Number(c.budget) : null,
        c.budget_mode || null,
        c.create_time ? new Date(c.create_time).toISOString().slice(0, 10) : null,
        c.modify_time ? new Date(c.modify_time).toISOString().slice(0, 10) : null,
      ]
    );
    const [r] = await pool.execute(
      'SELECT id FROM tiktok_campaigns WHERE ad_account_id = ? AND platform_campaign_id = ?',
      [accountRow.id, String(c.campaign_id)]
    );
    if (r[0]) platformToLocal.set(String(c.campaign_id), r[0].id);
  }

  // 2. Insights for last 30 days, daily, at the campaign level.
  // Account-level totals are derived by summing per-day across campaigns.
  const end = new Date();
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (platformToLocal.size === 0) {
    await pool.execute(
      'UPDATE tiktok_ad_accounts SET last_synced_at = NOW(), sync_error = NULL WHERE id = ?',
      [accountRow.id]
    );
    return { campaigns: 0 };
  }

  const metrics = [
    'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'cpm',
    'conversion', 'total_conversion_value', 'video_play_actions',
  ];

  let insightResp;
  try {
    insightResp = await axios.get(
      `${tt.DATA_API_BASE}/report/integrated/get/`,
      {
        params: {
          advertiser_id: advertiserId,
          report_type: 'BASIC',
          data_level: 'AUCTION_CAMPAIGN',
          dimensions: JSON.stringify(['campaign_id', 'stat_time_day']),
          metrics: JSON.stringify(metrics),
          start_date: isoDate(start),
          end_date: isoDate(end),
          page: 1,
          page_size: 1000,
        },
        headers: ttHeaders(accessToken),
        timeout: 60000,
      }
    );
  } catch (err) {
    const msg = err.response?.data?.message || err.message;
    await pool.execute(
      'UPDATE tiktok_ad_accounts SET sync_error = ? WHERE id = ?',
      [String(msg).slice(0, 500), accountRow.id]
    );
    throw new Error(`insights query failed: ${msg}`);
  }
  if (insightResp.data.code !== 0) {
    const msg = insightResp.data.message;
    await pool.execute(
      'UPDATE tiktok_ad_accounts SET sync_error = ? WHERE id = ?',
      [String(msg).slice(0, 500), accountRow.id]
    );
    throw new Error(`insights query failed: ${msg}`);
  }

  const rows = insightResp.data.data?.list || [];
  const perCampaign = new Map(); // key: `${campaignId}|${date}`
  const perAccount = new Map();  // key: date

  for (const row of rows) {
    const dim = row.dimensions || {};
    const m = row.metrics || {};
    const campId = String(dim.campaign_id || '');
    const date = (dim.stat_time_day || '').slice(0, 10);
    if (!campId || !date) continue;

    const rec = {
      spend: m.spend != null ? Number(m.spend) : 0,
      impressions: m.impressions != null ? Number(m.impressions) : 0,
      clicks: m.clicks != null ? Number(m.clicks) : 0,
      ctr: m.ctr != null ? Number(m.ctr) : null,
      cpc: m.cpc != null ? Number(m.cpc) : null,
      cpm: m.cpm != null ? Number(m.cpm) : null,
      conversions: m.conversion != null ? Number(m.conversion) : 0,
      conversionValue: m.total_conversion_value != null ? Number(m.total_conversion_value) : 0,
      videoViews: m.video_play_actions != null ? Number(m.video_play_actions) : 0,
    };

    const cKey = `${campId}|${date}`;
    if (!perCampaign.has(cKey)) perCampaign.set(cKey, { campId, date, ...rec });

    const prev = perAccount.get(date) || {
      spend: 0, impressions: 0, clicks: 0, conversions: 0,
      conversionValue: 0, videoViews: 0,
    };
    prev.spend += rec.spend;
    prev.impressions += rec.impressions;
    prev.clicks += rec.clicks;
    prev.conversions += rec.conversions;
    prev.conversionValue += rec.conversionValue;
    prev.videoViews += rec.videoViews;
    perAccount.set(date, prev);
  }

  for (const v of perCampaign.values()) {
    const localCampaign = platformToLocal.get(v.campId);
    if (!localCampaign) continue;
    const roas = (v.spend > 0 && v.conversionValue > 0)
      ? Number((v.conversionValue / v.spend).toFixed(4)) : null;
    await pool.execute(
      `INSERT INTO tiktok_ad_insights
         (ad_account_id, campaign_id, level, date_start,
          spend, impressions, clicks, ctr, cpc, cpm,
          conversions, conversion_value, roas, video_views)
       VALUES (?, ?, 'campaign', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         spend = VALUES(spend), impressions = VALUES(impressions), clicks = VALUES(clicks),
         ctr = VALUES(ctr), cpc = VALUES(cpc), cpm = VALUES(cpm),
         conversions = VALUES(conversions), conversion_value = VALUES(conversion_value),
         roas = VALUES(roas), video_views = VALUES(video_views),
         fetched_at = CURRENT_TIMESTAMP`,
      [accountRow.id, localCampaign, v.date, v.spend, v.impressions, v.clicks,
       v.ctr, v.cpc, v.cpm, v.conversions, v.conversionValue, roas, v.videoViews]
    );
  }

  for (const [date, v] of perAccount.entries()) {
    const ctr = v.impressions > 0 ? Number((v.clicks / v.impressions * 100).toFixed(4)) : null;
    const cpc = v.clicks > 0 ? Number((v.spend / v.clicks).toFixed(4)) : null;
    const cpm = v.impressions > 0 ? Number(((v.spend / v.impressions) * 1000).toFixed(4)) : null;
    const roas = v.spend > 0 ? Number((v.conversionValue / v.spend).toFixed(4)) : null;
    await pool.execute(
      `INSERT INTO tiktok_ad_insights
         (ad_account_id, campaign_id, level, date_start,
          spend, impressions, clicks, ctr, cpc, cpm,
          conversions, conversion_value, roas, video_views)
       VALUES (?, NULL, 'account', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         spend = VALUES(spend), impressions = VALUES(impressions), clicks = VALUES(clicks),
         ctr = VALUES(ctr), cpc = VALUES(cpc), cpm = VALUES(cpm),
         conversions = VALUES(conversions), conversion_value = VALUES(conversion_value),
         roas = VALUES(roas), video_views = VALUES(video_views),
         fetched_at = CURRENT_TIMESTAMP`,
      [accountRow.id, date, v.spend, v.impressions, v.clicks,
       ctr, cpc, cpm, v.conversions, v.conversionValue, roas, v.videoViews]
    );
  }

  await pool.execute(
    'UPDATE tiktok_ad_accounts SET last_synced_at = NOW(), sync_error = NULL WHERE id = ?',
    [accountRow.id]
  );
  return { campaigns: platformToLocal.size };
}

async function syncAll() {
  const [accounts] = await pool.execute(
    'SELECT * FROM tiktok_ad_accounts WHERE is_active = 1'
  );
  let ok = 0, failed = 0;
  for (const a of accounts) {
    try { await syncAccount(a); ok++; }
    catch (e) { failed++; logger.error(`TikTok ads sync: account ${a.id} failed: ${e.message}`); }
  }
  return { ok, failed, total: accounts.length };
}

async function syncOne(adAccountId) {
  const [rows] = await pool.execute(
    'SELECT * FROM tiktok_ad_accounts WHERE id = ? AND is_active = 1',
    [adAccountId]
  );
  if (rows.length === 0) throw Object.assign(new Error('Ad account not found'), { status: 404 });
  return syncAccount(rows[0]);
}

// ── Reads ─────────────────────────────────────────────────────────────────────

async function listAccounts({ clientId }) {
  const params = [];
  let where = 'a.is_active = 1';
  if (clientId) { where += ' AND a.client_id = ?'; params.push(clientId); }

  const [rows] = await pool.execute(
    `SELECT a.id, a.advertiser_id, a.advertiser_name, a.currency, a.timezone, a.status,
            a.is_sandbox, a.client_id, a.last_synced_at, a.sync_error, a.created_at,
            g.tiktok_user_id, g.display_name AS grant_display_name, g.last_discover_error,
            c.name AS client_name, c.color AS client_color
     FROM tiktok_ad_accounts a
     JOIN tiktok_oauth_grants g ON a.grant_id = g.id
     LEFT JOIN clients c ON a.client_id = c.id
     WHERE ${where}
     ORDER BY a.advertiser_name ASC`,
    params
  );

  return rows.map(r => ({
    id: r.id,
    advertiserId: r.advertiser_id,
    name: r.advertiser_name || `Advertiser ${r.advertiser_id}`,
    currency: r.currency,
    timezone: r.timezone,
    status: r.status,
    isSandbox: !!r.is_sandbox,
    clientId: r.client_id,
    clientName: r.client_name,
    clientColor: r.client_color,
    tiktokUserId: r.tiktok_user_id,
    grantDisplayName: r.grant_display_name,
    lastSyncedAt: r.last_synced_at,
    syncError: r.sync_error,
    discoverError: r.last_discover_error,
    createdAt: r.created_at,
  }));
}

async function listPendingGrants({ userId }) {
  const [rows] = await pool.execute(
    `SELECT g.id, g.tiktok_user_id, g.display_name, g.last_discover_error, g.created_at,
            (SELECT COUNT(*) FROM tiktok_ad_accounts a WHERE a.grant_id = g.id) AS account_count
     FROM tiktok_oauth_grants g
     WHERE g.is_active = 1 ${userId ? 'AND g.user_id = ?' : ''}
     ORDER BY g.created_at DESC`,
    userId ? [userId] : []
  );
  return rows
    .filter(r => r.account_count === 0)
    .map(r => ({
      id: r.id,
      tiktokUserId: r.tiktok_user_id,
      displayName: r.display_name,
      discoverError: r.last_discover_error,
      createdAt: r.created_at,
    }));
}

async function getOverview({ clientId, start, end, days = 30 }) {
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
    scopeJoin = 'JOIN tiktok_ad_accounts a ON i.ad_account_id = a.id';
    scopeWhere = 'AND a.client_id = ?';
    params.push(clientId);
  }

  const [totals] = await pool.execute(
    `SELECT COALESCE(SUM(i.spend), 0) AS spend,
            COALESCE(SUM(i.impressions), 0) AS impressions,
            COALESCE(SUM(i.clicks), 0) AS clicks,
            COALESCE(SUM(i.conversions), 0) AS conversions,
            COALESCE(SUM(i.conversion_value), 0) AS conversion_value,
            COALESCE(SUM(i.video_views), 0) AS video_views
     FROM tiktok_ad_insights i
     ${scopeJoin}
     WHERE i.level = 'account' AND i.date_start BETWEEN ? AND ? ${scopeWhere}`,
    params
  );

  const [daily] = await pool.execute(
    `SELECT i.date_start AS date,
            SUM(i.spend) AS spend, SUM(i.impressions) AS impressions, SUM(i.clicks) AS clicks
     FROM tiktok_ad_insights i
     ${scopeJoin}
     WHERE i.level = 'account' AND i.date_start BETWEEN ? AND ? ${scopeWhere}
     GROUP BY i.date_start
     ORDER BY i.date_start ASC`,
    params
  );

  const campaignParams = clientId ? [start, end, clientId] : [start, end];
  const [topCampaigns] = await pool.execute(
    `SELECT camp.id, camp.platform_campaign_id, camp.name, camp.status, camp.objective_type,
            a.id AS ad_account_id, a.advertiser_name AS account_name, a.currency,
            SUM(i.spend) AS spend, SUM(i.impressions) AS impressions, SUM(i.clicks) AS clicks,
            SUM(i.conversions) AS conversions, SUM(i.conversion_value) AS conversion_value,
            SUM(i.video_views) AS video_views
     FROM tiktok_campaigns camp
     JOIN tiktok_ad_accounts a ON camp.ad_account_id = a.id
     LEFT JOIN tiktok_ad_insights i ON i.campaign_id = camp.id AND i.level = 'campaign'
       AND i.date_start BETWEEN ? AND ?
     WHERE 1=1 ${clientId ? 'AND a.client_id = ?' : ''}
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
      clicks: Number(t.clicks) || 0,
      conversions: Number(t.conversions) || 0,
      conversionValue,
      videoViews: Number(t.video_views) || 0,
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
    })),
    topCampaigns: topCampaigns.map(c => {
      const cSpend = Number(c.spend) || 0;
      return {
        id: c.id,
        platformCampaignId: c.platform_campaign_id,
        name: c.name,
        status: c.status,
        objectiveType: c.objective_type,
        currency: c.currency,
        accountId: c.ad_account_id,
        accountName: c.account_name,
        spend: cSpend,
        impressions: Number(c.impressions) || 0,
        clicks: Number(c.clicks) || 0,
        conversions: Number(c.conversions) || 0,
        conversionValue: Number(c.conversion_value) || 0,
        videoViews: Number(c.video_views) || 0,
        ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
        cpc: c.clicks > 0 ? cSpend / c.clicks : 0,
        roas: cSpend > 0 ? (Number(c.conversion_value) || 0) / cSpend : 0,
      };
    }),
  };
}

async function assignAccountToClient(adAccountId, clientId) {
  await pool.execute(
    'UPDATE tiktok_ad_accounts SET client_id = ? WHERE id = ?',
    [clientId || null, adAccountId]
  );
}

async function disconnectAccount(adAccountId) {
  await pool.execute(
    'UPDATE tiktok_ad_accounts SET is_active = 0 WHERE id = ?',
    [adAccountId]
  );
}

async function disconnectGrant(grantId, userId) {
  await pool.execute(
    `UPDATE tiktok_oauth_grants SET is_active = 0 WHERE id = ? AND user_id = ?`,
    [grantId, userId]
  );
  await pool.execute(
    `UPDATE tiktok_ad_accounts SET is_active = 0 WHERE grant_id = ?`,
    [grantId]
  );
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  fetchUserInfo,
  storeGrant,
  discoverAccounts,
  syncAccount,
  syncAll,
  syncOne,
  listAccounts,
  listPendingGrants,
  getOverview,
  assignAccountToClient,
  disconnectAccount,
  disconnectGrant,
};
