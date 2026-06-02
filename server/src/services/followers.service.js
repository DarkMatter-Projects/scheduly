const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const ig = require('../config/instagram');
const tt = require('../config/tiktok_login');
const { decrypt } = require('./token.service');
const logger = require('../utils/logger');

// Per-platform follower-count fetchers. Each returns a non-negative integer
// or null when the platform doesn't expose the number on the granted scopes
// (e.g. TikTok without user.info.stats). null means "don't store a snapshot
// for this account today" — distinguishes scope gaps from real zeros.
async function fetchFollowerCount(account) {
  const token = decrypt(account.access_token);
  if (account.platform === 'facebook_page') {
    // Page tokens can read fan_count + followers_count directly. fan_count is
    // legacy "Likes"; followers_count is the modern subscriber number Meta
    // surfaces in the Page admin UI, so prefer it.
    const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${account.platform_account_id}`, {
      params: { fields: 'followers_count,fan_count', access_token: token },
      timeout: 10000,
    });
    const v = Number(data?.followers_count ?? data?.fan_count);
    return Number.isFinite(v) ? v : null;
  }

  if (account.platform === 'instagram_business') {
    // IG Business Login tokens MUST go to graph.instagram.com, not the Meta
    // graph host (the Meta host returns "Cannot parse access token").
    const { data } = await axios.get(`${ig.IG_GRAPH_URL}/${account.platform_account_id}`, {
      params: { fields: 'followers_count', access_token: token },
      timeout: 10000,
    });
    const v = Number(data?.followers_count);
    return Number.isFinite(v) ? v : null;
  }

  if (account.platform === 'tiktok') {
    // follower_count is gated behind user.info.stats; we currently only
    // request user.info.basic, so this will fail with scope_not_authorized
    // on most installs. Catch and return null so the snapshot is skipped
    // until we expand the scope set in a future OAuth round.
    try {
      const { data } = await axios.get(`${tt.TIKTOK_API_BASE}/user/info/?fields=follower_count`, {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      const v = Number(data?.data?.user?.follower_count);
      return Number.isFinite(v) ? v : null;
    } catch (err) {
      const code = err.response?.data?.error?.code || err.response?.status;
      logger.debug(`TikTok follower_count unavailable for account ${account.id} (${code})`);
      return null;
    }
  }

  if (account.platform === 'linkedin') {
    // organization follower count — needs r_organization_social.
    // Falls back to null when only personal/OIDC scopes are granted.
    try {
      const orgUrn = `urn:li:organization:${account.platform_account_id}`;
      const { data } = await axios.get(`https://api.linkedin.com/v2/networkSizes/${encodeURIComponent(orgUrn)}`, {
        params: { edgeType: 'CompanyFollowedByMember' },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      const v = Number(data?.firstDegreeSize);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  if (account.platform === 'youtube') {
    // Subscribers are under channel statistics. The API key is unused
    // because we use the user's OAuth bearer for their own channel.
    try {
      const { data } = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: { part: 'statistics', mine: 'true' },
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
      });
      const items = data?.items || [];
      const v = Number(items[0]?.statistics?.subscriberCount);
      return Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  return null;
}

// UPSERT today's snapshot for an account. delta_count is computed against
// the most recent snapshot strictly before today; first snapshot for an
// account stores 0 so day-one doesn't pretend to be "+1234 followers".
async function recordSnapshot(socialAccountId, count, snapshotDate) {
  const dateStr = snapshotDate || new Date().toISOString().slice(0, 10);
  const [prevRows] = await pool.execute(
    `SELECT followers_count FROM follower_history
     WHERE social_account_id = ? AND snapshot_date < ?
     ORDER BY snapshot_date DESC LIMIT 1`,
    [socialAccountId, dateStr]
  );
  const prev = prevRows[0]?.followers_count;
  const delta = (prev === undefined || prev === null) ? 0 : Number(count) - Number(prev);
  await pool.execute(
    `INSERT INTO follower_history (social_account_id, snapshot_date, followers_count, delta_count)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE followers_count = VALUES(followers_count), delta_count = VALUES(delta_count)`,
    [socialAccountId, dateStr, Number(count), delta]
  );
}

module.exports = { fetchFollowerCount, recordSnapshot };
