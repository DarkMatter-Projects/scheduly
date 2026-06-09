const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const tw = require('../config/twitter');
const { decrypt } = require('./token.service');
const logger = require('../utils/logger');

// Place autocomplete search for the composer's geotag picker. We
// use whatever connected account's token we have to call the
// platform's place search:
//   - FB: /search?type=place&q=...  (returns Page IDs)
//   - X:  /1.1/geo/search.json?query=...  (returns place_id)
//
// Both endpoints are user-context: any active token for the user's
// platform is enough. We pick the freshest active social_account row
// for the user that matches the platform.
async function searchPlaces({ userId, platform, query }) {
  if (!query || !query.trim()) return [];
  const q = query.trim();
  const account = await pickAccountForUser(userId, platform);
  if (!account) {
    return { error: `Connect a ${platform === 'twitter' ? 'X' : 'Facebook'} account to search for places.` };
  }
  try {
    if (platform === 'facebook_page') return await searchFacebookPlaces(account, q);
    if (platform === 'twitter')       return await searchTwitterPlaces(account, q);
  } catch (err) {
    const detail = err.response?.data?.error?.message
                || err.response?.data?.errors?.[0]?.message
                || err.response?.data?.title
                || err.message;
    logger.warn(`Place search failed (${platform}): ${detail}`);
    return { error: detail };
  }
  return [];
}

async function pickAccountForUser(userId, platform) {
  // Prefer the most-recently-active account the user themselves
  // connected — falls back to any active account on the platform
  // if the user has none of their own (small teams share accounts).
  const [own] = await pool.execute(
    `SELECT * FROM social_accounts
     WHERE platform = ? AND is_active = 1 AND connected_by = ?
     ORDER BY updated_at DESC LIMIT 1`,
    [platform, userId]
  );
  if (own.length > 0) return own[0];
  const [any] = await pool.execute(
    `SELECT * FROM social_accounts
     WHERE platform = ? AND is_active = 1
     ORDER BY updated_at DESC LIMIT 1`,
    [platform]
  );
  return any[0] || null;
}

async function searchFacebookPlaces(account, q) {
  const token = decrypt(account.access_token);
  const { data } = await axios.get(`${fb.FB_GRAPH_URL}/search`, {
    params: {
      type: 'place',
      q,
      fields: 'id,name,location,category',
      limit: 12,
      access_token: token,
    },
    timeout: 12000,
  });
  return (data?.data || []).map(p => ({
    id: p.id,
    label: p.name,
    sublabel: [
      p.location?.city,
      p.location?.state,
      p.location?.country,
    ].filter(Boolean).join(', '),
    category: p.category,
  }));
}

async function searchTwitterPlaces(account, q) {
  const token = decrypt(account.access_token);
  // X retired /1.1/geo/search.json for most apps; we try the v1.1
  // endpoint first (works for legacy access tiers) and fall back to
  // the v2 trends/available approach if that 404s.
  try {
    const { data } = await axios.get('https://api.x.com/1.1/geo/search.json', {
      params: { query: q, granularity: 'city', max_results: 10 },
      headers: { Authorization: `Bearer ${token}` },
      timeout: 12000,
    });
    const places = data?.result?.places || [];
    return places.map(p => ({
      id: p.id,
      label: p.full_name || p.name,
      sublabel: p.country || '',
      category: p.place_type,
    }));
  } catch (err) {
    if (err.response?.status === 404 || err.response?.status === 403) {
      // Legacy endpoint not enabled on this app tier. Return a hint
      // rather than nothing so the UI can show the user what's wrong.
      return { error: 'X geo search requires Basic tier or higher. Paste a place ID manually.' };
    }
    throw err;
  }
}

module.exports = { searchPlaces };
