const axios = require('axios');
const pool = require('../config/db');
const google = require('../config/google');
const { encrypt, decrypt } = require('./token.service');
const logger = require('../utils/logger');

// ── OAuth ─────────────────────────────────────────────────────────────────────

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: google.clientId,
    redirect_uri: google.redirectUri,
    response_type: 'code',
    access_type: 'offline',     // ask for a refresh_token
    prompt: 'consent',          // force the consent screen so we always get one
    include_granted_scopes: 'true',
    scope: google.GOOGLE_SCOPES,
    state,
  });
  return `${google.GOOGLE_OAUTH_URL}?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const form = new URLSearchParams();
  form.append('code', code);
  form.append('client_id', google.clientId);
  form.append('client_secret', google.clientSecret);
  form.append('redirect_uri', google.redirectUri);
  form.append('grant_type', 'authorization_code');

  const { data } = await axios.post(google.GOOGLE_TOKEN_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
    scope: data.scope,
    idToken: data.id_token,
  };
}

async function refreshAccessToken(refreshTokenPlain) {
  const form = new URLSearchParams();
  form.append('client_id', google.clientId);
  form.append('client_secret', google.clientSecret);
  form.append('refresh_token', refreshTokenPlain);
  form.append('grant_type', 'refresh_token');

  const { data } = await axios.post(google.GOOGLE_TOKEN_URL, form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
  };
}

async function fetchUserInfo(accessToken) {
  const { data } = await axios.get(google.GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return data; // { sub, email, name, picture, ... }
}

// Persist a grant + try to discover customers. If we have no developer token
// yet, the grant is stored but customers stay empty (sync_error explains).
async function storeGrant({ tokens, userInfo, userId, teamId }) {
  const refreshEnc = encrypt(tokens.refreshToken);
  const accessEnc = tokens.accessToken ? encrypt(tokens.accessToken) : null;
  const expiresAt = tokens.expiresIn ? new Date(Date.now() + tokens.expiresIn * 1000) : null;

  const [result] = await pool.execute(
    `INSERT INTO google_oauth_grants
       (user_id, team_id, google_email, refresh_token, access_token, access_token_expires_at, scopes)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       refresh_token = VALUES(refresh_token),
       access_token = VALUES(access_token),
       access_token_expires_at = VALUES(access_token_expires_at),
       scopes = VALUES(scopes),
       is_active = 1`,
    [
      userId,
      teamId || null,
      userInfo.email,
      refreshEnc,
      accessEnc,
      expiresAt,
      tokens.scope || null,
    ]
  );

  // INSERT ON DUPLICATE KEY UPDATE returns the existing id if it was updated
  let grantId = result.insertId;
  if (!grantId) {
    const [rows] = await pool.execute(
      'SELECT id FROM google_oauth_grants WHERE user_id = ? AND google_email = ?',
      [userId, userInfo.email]
    );
    grantId = rows[0]?.id;
  }

  return grantId;
}

// ── Customer discovery ────────────────────────────────────────────────────────

function adsApiHeaders(accessToken, loginCustomerId) {
  if (!google.adsDeveloperToken) {
    throw Object.assign(
      new Error('Google Ads developer token is not configured (GOOGLE_ADS_DEVELOPER_TOKEN). Apply for one at https://ads.google.com/aw/apicenter'),
      { code: 'NO_DEV_TOKEN' }
    );
  }
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': google.adsDeveloperToken,
    'Content-Type': 'application/json',
  };
  if (loginCustomerId) headers['login-customer-id'] = loginCustomerId;
  return headers;
}

async function getAccessTokenForGrant(grant) {
  // Refresh proactively if missing or within 60s of expiry
  const expiry = grant.access_token_expires_at ? new Date(grant.access_token_expires_at).getTime() : 0;
  if (grant.access_token && Date.now() < expiry - 60 * 1000) {
    return decrypt(grant.access_token);
  }
  const { accessToken, expiresIn } = await refreshAccessToken(decrypt(grant.refresh_token));
  const newExpiry = new Date(Date.now() + expiresIn * 1000);
  await pool.execute(
    'UPDATE google_oauth_grants SET access_token = ?, access_token_expires_at = ? WHERE id = ?',
    [encrypt(accessToken), newExpiry, grant.id]
  );
  return accessToken;
}

// Returns the list of customer IDs the OAuth user can act on. These are
// resource names like "customers/1234567890".
async function listAccessibleCustomers(accessToken) {
  const headers = adsApiHeaders(accessToken);
  const { data } = await axios.get(
    `${google.GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`,
    { headers, timeout: 15000 }
  );
  // resourceNames: ["customers/1234567890", ...]
  return (data.resourceNames || []).map(r => r.split('/').pop());
}

async function describeCustomer(accessToken, customerId, loginCustomerId) {
  const headers = adsApiHeaders(accessToken, loginCustomerId);
  const query = `
    SELECT customer.id, customer.descriptive_name, customer.currency_code,
           customer.time_zone, customer.manager, customer.test_account
    FROM customer
    LIMIT 1
  `;
  const { data } = await axios.post(
    `${google.GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`,
    { query },
    { headers, timeout: 15000 }
  );
  // Search-stream returns an array of stream chunks; each has results[]
  const first = Array.isArray(data) ? data[0] : data;
  const result = first?.results?.[0]?.customer;
  return result || null;
}

async function discoverAccounts(grantId) {
  const [rows] = await pool.execute('SELECT * FROM google_oauth_grants WHERE id = ?', [grantId]);
  if (rows.length === 0) throw Object.assign(new Error('Grant not found'), { status: 404 });
  const grant = rows[0];

  let accessToken;
  try {
    accessToken = await getAccessTokenForGrant(grant);
  } catch (e) {
    throw new Error(`Could not refresh Google access token: ${e.message}`);
  }

  let customerIds;
  try {
    customerIds = await listAccessibleCustomers(accessToken);
  } catch (e) {
    if (e.code === 'NO_DEV_TOKEN') {
      await pool.execute(
        'UPDATE google_oauth_grants SET last_discover_error = ? WHERE id = ?',
        [e.message, grantId]
      );
      throw e;
    }
    const status = e.response?.status;
    const body = e.response?.data;
    const apiMsg = (body && typeof body === 'object' && body.error?.message)
      || (typeof body === 'string' ? body.slice(0, 200) : null);
    const versionHint = status === 404
      ? ` (this often means the Google Ads API version "${google.GOOGLE_ADS_API_VERSION}" is no longer supported — bump GOOGLE_ADS_API_VERSION env var)`
      : '';
    const msg = `[${status || 'no status'}] ${apiMsg || e.message}${versionHint}`;
    logger.warn('Google Ads listAccessibleCustomers failed', { status, body: typeof body === 'object' ? body : String(body).slice(0, 400) });
    await pool.execute(
      'UPDATE google_oauth_grants SET last_discover_error = ? WHERE id = ?',
      [msg.slice(0, 500), grantId]
    );
    throw new Error(`listAccessibleCustomers failed: ${msg}`);
  }

  await pool.execute(
    'UPDATE google_oauth_grants SET last_discover_error = NULL WHERE id = ?',
    [grantId]
  );

  // Describe each customer to grab name/currency. The trick: an account may
  // be either (a) directly accessible — describe with no login-customer-id,
  // or (b) MCC-managed — describe with login-customer-id set to the MCC.
  // Sending the wrong header gets you 400/403. We try direct first, then
  // fall back to the configured MCC. We persist whichever path worked so
  // syncAccount uses the same one later.
  const mccId = google.adsLoginCustomerId || null;
  const discovered = [];
  const failures = [];

  for (const cid of customerIds) {
    let desc = null;
    let usedLoginCustomerId = null;

    // Pass 1: try without login-customer-id (works for direct access + MCCs themselves)
    try {
      desc = await describeCustomer(accessToken, cid, null);
    } catch (e1) {
      const status1 = e1.response?.status;
      // Only retry with MCC if (a) MCC is configured, (b) it's not the same id,
      // and (c) the error suggests a permission/manager issue (400/403).
      if (mccId && String(mccId) !== String(cid) && (status1 === 400 || status1 === 403)) {
        try {
          desc = await describeCustomer(accessToken, cid, mccId);
          usedLoginCustomerId = mccId;
        } catch (e2) {
          const msg2 = e2.response?.data?.error?.message || e2.message;
          failures.push({ customerId: cid, message: msg2 });
          logger.warn(`Google Ads: describe customer ${cid} failed (with MCC ${mccId}): ${msg2}`);
          continue;
        }
      } else {
        const msg1 = e1.response?.data?.error?.message || e1.message;
        failures.push({ customerId: cid, message: msg1 });
        logger.warn(`Google Ads: describe customer ${cid} failed: ${msg1}`);
        continue;
      }
    }

    if (!desc) continue;

    await pool.execute(
      `INSERT INTO google_ad_accounts
         (grant_id, customer_id, descriptive_name, currency_code, time_zone, manager, test_account, login_customer_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         grant_id = VALUES(grant_id),
         descriptive_name = VALUES(descriptive_name),
         currency_code = VALUES(currency_code),
         time_zone = VALUES(time_zone),
         manager = VALUES(manager),
         test_account = VALUES(test_account),
         login_customer_id = VALUES(login_customer_id),
         is_active = 1`,
      [
        grantId,
        String(desc.id || cid),
        desc.descriptiveName || null,
        desc.currencyCode || null,
        desc.timeZone || null,
        desc.manager ? 1 : 0,
        desc.testAccount ? 1 : 0,
        usedLoginCustomerId,
      ]
    );
    discovered.push({ customerId: String(desc.id || cid), name: desc.descriptiveName });
  }

  if (failures.length > 0 && discovered.length === 0) {
    // Surface the first failure on the grant so the UI shows something useful.
    await pool.execute(
      'UPDATE google_oauth_grants SET last_discover_error = ? WHERE id = ?',
      [`All ${failures.length} customer(s) failed describe — first: ${failures[0].message}`.slice(0, 500), grantId]
    );
  }

  return discovered;
}

// ── Sync ──────────────────────────────────────────────────────────────────────

function microsToCurrency(n) {
  if (n == null) return null;
  return Math.round(Number(n)) / 1e6;
}

async function syncAccount(accountRow) {
  const [grantRows] = await pool.execute(
    'SELECT * FROM google_oauth_grants WHERE id = ?',
    [accountRow.grant_id]
  );
  if (grantRows.length === 0) throw new Error('Grant missing for ad account');
  const grant = grantRows[0];
  const accessToken = await getAccessTokenForGrant(grant);
  const customerId = accountRow.customer_id;
  // login_customer_id is stored per-account during discovery: NULL for
  // direct-access accounts, the MCC id for accounts only reachable via a
  // manager. Don't OR-fallback to the env MCC — that re-introduces the
  // 400 errors we just fixed for accounts the user has direct access to.
  const loginCustomerId = accountRow.login_customer_id || null;
  const headers = adsApiHeaders(accessToken, loginCustomerId);

  // Skip syncing manager accounts — they don't have own spend.
  if (accountRow.manager) {
    await pool.execute(
      'UPDATE google_ad_accounts SET last_synced_at = NOW(), sync_error = NULL WHERE id = ?',
      [accountRow.id]
    );
    return { campaigns: 0, manager: true };
  }

  // 1. Pull campaigns
  const campaignQuery = `
    SELECT campaign.id, campaign.name, campaign.status,
           campaign.advertising_channel_type, campaign.start_date, campaign.end_date,
           campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status IN ('ENABLED', 'PAUSED')
  `;
  let campaignResp;
  try {
    campaignResp = await axios.post(
      `${google.GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`,
      { query: campaignQuery },
      { headers, timeout: 30000 }
    );
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    await pool.execute(
      'UPDATE google_ad_accounts SET sync_error = ? WHERE id = ?',
      [msg.slice(0, 500), accountRow.id]
    );
    throw new Error(`campaigns query failed: ${msg}`);
  }

  const platformToLocal = new Map();
  const chunks = Array.isArray(campaignResp.data) ? campaignResp.data : [campaignResp.data];
  for (const chunk of chunks) {
    for (const row of chunk?.results || []) {
      const c = row.campaign || {};
      const budget = row.campaignBudget || {};
      await pool.execute(
        `INSERT INTO google_campaigns
           (ad_account_id, platform_campaign_id, name, status,
            advertising_channel_type, start_date, end_date, daily_budget_micros, budget_currency)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = VALUES(name),
           status = VALUES(status),
           advertising_channel_type = VALUES(advertising_channel_type),
           start_date = VALUES(start_date),
           end_date = VALUES(end_date),
           daily_budget_micros = VALUES(daily_budget_micros),
           budget_currency = VALUES(budget_currency),
           last_synced_at = CURRENT_TIMESTAMP`,
        [
          accountRow.id,
          String(c.id),
          c.name || String(c.id),
          c.status || null,
          c.advertisingChannelType || null,
          c.startDate || null,
          c.endDate || null,
          budget.amountMicros != null ? Number(budget.amountMicros) : null,
          accountRow.currency_code,
        ]
      );
      const [r] = await pool.execute(
        'SELECT id FROM google_campaigns WHERE ad_account_id = ? AND platform_campaign_id = ?',
        [accountRow.id, String(c.id)]
      );
      if (r[0]) platformToLocal.set(String(c.id), r[0].id);
    }
  }

  // 2. Daily insights (last 30 days), at campaign + account levels in one pass
  const insightsQuery = `
    SELECT campaign.id, segments.date,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.ctr, metrics.average_cpc, metrics.average_cpm,
           metrics.conversions, metrics.conversions_value
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS
  `;
  let insightResp;
  try {
    insightResp = await axios.post(
      `${google.GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:searchStream`,
      { query: insightsQuery },
      { headers, timeout: 60000 }
    );
  } catch (err) {
    const msg = err.response?.data?.error?.message || err.message;
    await pool.execute(
      'UPDATE google_ad_accounts SET sync_error = ? WHERE id = ?',
      [msg.slice(0, 500), accountRow.id]
    );
    throw new Error(`insights query failed: ${msg}`);
  }

  // Aggregate per (date, campaign) and per (date) for the account level
  const perCampaign = new Map(); // key: `${campaignId}|${date}`
  const perAccount = new Map();  // key: `${date}`

  const insightChunks = Array.isArray(insightResp.data) ? insightResp.data : [insightResp.data];
  for (const chunk of insightChunks) {
    for (const row of chunk?.results || []) {
      const campId = String(row.campaign?.id || '');
      const date = row.segments?.date;
      const m = row.metrics || {};
      if (!date) continue;
      const rec = {
        spend: microsToCurrency(m.costMicros),
        impressions: m.impressions != null ? Number(m.impressions) : 0,
        clicks: m.clicks != null ? Number(m.clicks) : 0,
        ctr: m.ctr != null ? Number(m.ctr) : null,
        averageCpc: microsToCurrency(m.averageCpc),
        averageCpm: microsToCurrency(m.averageCpm),
        conversions: m.conversions != null ? Number(m.conversions) : 0,
        conversionValue: m.conversionsValue != null ? Number(m.conversionsValue) : 0,
      };

      const cKey = `${campId}|${date}`;
      if (!perCampaign.has(cKey)) perCampaign.set(cKey, { campId, date, ...rec });

      const aKey = date;
      const prev = perAccount.get(aKey) || {
        spend: 0, impressions: 0, clicks: 0,
        averageCpc: null, averageCpm: null,
        conversions: 0, conversionValue: 0,
      };
      prev.spend = (prev.spend || 0) + (rec.spend || 0);
      prev.impressions += rec.impressions;
      prev.clicks += rec.clicks;
      prev.conversions += rec.conversions;
      prev.conversionValue += rec.conversionValue;
      perAccount.set(aKey, prev);
    }
  }

  // Persist
  for (const v of perCampaign.values()) {
    const localCampaign = platformToLocal.get(v.campId);
    if (!localCampaign) continue;
    const roas = (v.spend > 0 && v.conversionValue > 0) ? Number((v.conversionValue / v.spend).toFixed(4)) : null;
    await pool.execute(
      `INSERT INTO google_ad_insights
         (ad_account_id, campaign_id, level, date_start,
          spend, impressions, clicks, ctr, average_cpc, average_cpm,
          conversions, conversion_value, roas)
       VALUES (?, ?, 'campaign', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         spend = VALUES(spend),
         impressions = VALUES(impressions),
         clicks = VALUES(clicks),
         ctr = VALUES(ctr),
         average_cpc = VALUES(average_cpc),
         average_cpm = VALUES(average_cpm),
         conversions = VALUES(conversions),
         conversion_value = VALUES(conversion_value),
         roas = VALUES(roas),
         fetched_at = CURRENT_TIMESTAMP`,
      [accountRow.id, localCampaign, v.date, v.spend, v.impressions, v.clicks,
       v.ctr, v.averageCpc, v.averageCpm, v.conversions, v.conversionValue, roas]
    );
  }

  for (const [date, v] of perAccount.entries()) {
    const ctr = v.impressions > 0 ? Number((v.clicks / v.impressions).toFixed(4)) : null;
    const cpc = v.clicks > 0 ? Number((v.spend / v.clicks).toFixed(4)) : null;
    const cpm = v.impressions > 0 ? Number(((v.spend / v.impressions) * 1000).toFixed(4)) : null;
    const roas = v.spend > 0 ? Number((v.conversionValue / v.spend).toFixed(4)) : null;
    await pool.execute(
      `INSERT INTO google_ad_insights
         (ad_account_id, campaign_id, level, date_start,
          spend, impressions, clicks, ctr, average_cpc, average_cpm,
          conversions, conversion_value, roas)
       VALUES (?, NULL, 'account', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         spend = VALUES(spend),
         impressions = VALUES(impressions),
         clicks = VALUES(clicks),
         ctr = VALUES(ctr),
         average_cpc = VALUES(average_cpc),
         average_cpm = VALUES(average_cpm),
         conversions = VALUES(conversions),
         conversion_value = VALUES(conversion_value),
         roas = VALUES(roas),
         fetched_at = CURRENT_TIMESTAMP`,
      [accountRow.id, date, v.spend, v.impressions, v.clicks,
       ctr, cpc, cpm, v.conversions, v.conversionValue, roas]
    );
  }

  await pool.execute(
    'UPDATE google_ad_accounts SET last_synced_at = NOW(), sync_error = NULL WHERE id = ?',
    [accountRow.id]
  );
  return { campaigns: platformToLocal.size };
}

async function syncAll() {
  const [accounts] = await pool.execute(
    'SELECT * FROM google_ad_accounts WHERE is_active = 1'
  );
  let ok = 0, failed = 0;
  for (const a of accounts) {
    try { await syncAccount(a); ok++; }
    catch (e) { failed++; logger.error(`Google Ads sync: account ${a.id} failed: ${e.message}`); }
  }
  return { ok, failed, total: accounts.length };
}

async function syncOne(adAccountId) {
  const [rows] = await pool.execute(
    'SELECT * FROM google_ad_accounts WHERE id = ? AND is_active = 1',
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
    `SELECT a.id, a.customer_id, a.descriptive_name, a.currency_code, a.time_zone,
            a.manager, a.test_account, a.client_id, a.last_synced_at, a.sync_error, a.created_at,
            g.google_email, g.last_discover_error,
            c.name AS client_name, c.color AS client_color
     FROM google_ad_accounts a
     JOIN google_oauth_grants g ON a.grant_id = g.id
     LEFT JOIN clients c ON a.client_id = c.id
     WHERE ${where}
     ORDER BY a.descriptive_name ASC`,
    params
  );

  return rows.map(r => ({
    id: r.id,
    customerId: r.customer_id,
    name: r.descriptive_name || `Customer ${r.customer_id}`,
    currency: r.currency_code,
    timeZone: r.time_zone,
    manager: !!r.manager,
    testAccount: !!r.test_account,
    clientId: r.client_id,
    clientName: r.client_name,
    clientColor: r.client_color,
    googleEmail: r.google_email,
    lastSyncedAt: r.last_synced_at,
    syncError: r.sync_error,
    discoverError: r.last_discover_error,
    createdAt: r.created_at,
  }));
}

async function listPendingGrants({ userId }) {
  // OAuth grants whose customers haven't been discovered yet (typically
  // because the developer token isn't set or discovery 403'd).
  const [rows] = await pool.execute(
    `SELECT g.id, g.google_email, g.last_discover_error, g.created_at,
            (SELECT COUNT(*) FROM google_ad_accounts a WHERE a.grant_id = g.id) AS account_count
     FROM google_oauth_grants g
     WHERE g.is_active = 1 ${userId ? 'AND g.user_id = ?' : ''}
     ORDER BY g.created_at DESC`,
    userId ? [userId] : []
  );
  return rows
    .filter(r => r.account_count === 0)
    .map(r => ({
      id: r.id,
      googleEmail: r.google_email,
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
    scopeJoin = 'JOIN google_ad_accounts a ON i.ad_account_id = a.id';
    scopeWhere = 'AND a.client_id = ?';
    params.push(clientId);
  }

  const [totals] = await pool.execute(
    `SELECT COALESCE(SUM(i.spend), 0) AS spend,
            COALESCE(SUM(i.impressions), 0) AS impressions,
            COALESCE(SUM(i.clicks), 0) AS clicks,
            COALESCE(SUM(i.conversions), 0) AS conversions,
            COALESCE(SUM(i.conversion_value), 0) AS conversion_value
     FROM google_ad_insights i
     ${scopeJoin}
     WHERE i.level = 'account' AND i.date_start BETWEEN ? AND ? ${scopeWhere}`,
    params
  );

  const [daily] = await pool.execute(
    `SELECT i.date_start AS date,
            SUM(i.spend) AS spend, SUM(i.impressions) AS impressions, SUM(i.clicks) AS clicks
     FROM google_ad_insights i
     ${scopeJoin}
     WHERE i.level = 'account' AND i.date_start BETWEEN ? AND ? ${scopeWhere}
     GROUP BY i.date_start
     ORDER BY i.date_start ASC`,
    params
  );

  const campaignParams = clientId ? [start, end, clientId] : [start, end];
  const [topCampaigns] = await pool.execute(
    `SELECT camp.id, camp.platform_campaign_id, camp.name, camp.status,
            camp.advertising_channel_type, camp.budget_currency,
            a.id AS ad_account_id, a.descriptive_name AS account_name, a.currency_code,
            SUM(i.spend) AS spend, SUM(i.impressions) AS impressions, SUM(i.clicks) AS clicks,
            SUM(i.conversions) AS conversions, SUM(i.conversion_value) AS conversion_value
     FROM google_campaigns camp
     JOIN google_ad_accounts a ON camp.ad_account_id = a.id
     LEFT JOIN google_ad_insights i ON i.campaign_id = camp.id AND i.level = 'campaign'
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
        channelType: c.advertising_channel_type,
        currency: c.currency_code || c.budget_currency,
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

async function assignAccountToClient(adAccountId, clientId) {
  await pool.execute(
    'UPDATE google_ad_accounts SET client_id = ? WHERE id = ?',
    [clientId || null, adAccountId]
  );
}

async function disconnectAccount(adAccountId) {
  await pool.execute(
    'UPDATE google_ad_accounts SET is_active = 0 WHERE id = ?',
    [adAccountId]
  );
}

async function disconnectGrant(grantId, userId) {
  // Soft-disconnect the grant AND all its accounts.
  await pool.execute(
    `UPDATE google_oauth_grants SET is_active = 0 WHERE id = ? AND user_id = ?`,
    [grantId, userId]
  );
  await pool.execute(
    `UPDATE google_ad_accounts SET is_active = 0 WHERE grant_id = ?`,
    [grantId]
  );
}

module.exports = {
  getAuthUrl,
  exchangeCodeForToken,
  refreshAccessToken,
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
