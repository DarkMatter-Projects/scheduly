const axios = require('axios');
const pool = require('../config/db');
const ig = require('../config/instagram');
const { decrypt } = require('./token.service');
const logger = require('../utils/logger');

const MEDIA_FIELDS = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count';
const PAGE_LIMIT = 50;
const MAX_PAGES = 200; // ~10k posts ceiling — IG accounts almost never exceed this

function mapMediaType(t) {
  if (t === 'VIDEO') return 'video';
  if (t === 'CAROUSEL_ALBUM') return 'carousel';
  return 'image';
}

async function fetchInsights(mediaId, mediaType, token) {
  const metric = mediaType === 'VIDEO'
    ? 'reach,saved,video_views'
    : 'reach,saved,impressions';
  try {
    const { data } = await axios.get(`${ig.IG_GRAPH_URL}/${mediaId}/insights`, {
      params: { metric, access_token: token },
      timeout: 12000,
    });
    const out = {};
    for (const row of data.data || []) {
      const val = row.values?.[0]?.value || 0;
      if (row.name === 'impressions') out.impressions = val;
      else if (row.name === 'reach') out.reach = val;
      else if (row.name === 'saved') out.saves = val;
      else if (row.name === 'video_views') out.impressions = val; // proxy for video
    }
    return out;
  } catch (err) {
    // Insights past Meta's retention window return errors. That's fine —
    // we still capture like/comment counts from the basic media call.
    return {};
  }
}

async function importHistory(socialAccountId, userId) {
  const [rows] = await pool.execute(
    `SELECT id, platform, platform_account_id, account_name, access_token, team_id, client_id
     FROM social_accounts WHERE id = ? AND is_active = 1`,
    [socialAccountId]
  );
  if (rows.length === 0) {
    throw Object.assign(new Error('Account not found or inactive'), { status: 404 });
  }
  const account = rows[0];
  if (account.platform !== 'instagram_business') {
    throw Object.assign(new Error('Import is currently only supported for Instagram'), { status: 400 });
  }

  const token = decrypt(account.access_token);

  let url = `${ig.IG_GRAPH_URL}/${account.platform_account_id}/media`;
  let params = { fields: MEDIA_FIELDS, limit: PAGE_LIMIT, access_token: token };
  let pageNum = 0;
  const result = { fetched: 0, created: 0, updated: 0, withInsights: 0, errors: [] };

  while (url && pageNum < MAX_PAGES) {
    pageNum++;
    let data;
    try {
      ({ data } = await axios.get(url, { params, timeout: 20000 }));
    } catch (err) {
      const apiError = err.response?.data?.error;
      const msg = apiError?.message || err.message;
      throw Object.assign(new Error(`Instagram /media failed: ${msg}`), { code: apiError?.code });
    }

    const items = data.data || [];
    result.fetched += items.length;

    for (const item of items) {
      try {
        const created = await upsertImportedMedia(item, account, userId, token);
        if (created.created) result.created++;
        else result.updated++;
        if (created.hadInsights) result.withInsights++;
      } catch (err) {
        result.errors.push({ mediaId: item.id, message: err.message });
        logger.warn(`IG import: media ${item.id} failed: ${err.message}`);
      }
    }

    url = data.paging?.next || null;
    params = undefined; // next URL already includes everything
  }

  logger.info(
    `IG import complete for account ${account.id} (${account.account_name}): ` +
    `${result.fetched} fetched, ${result.created} new, ${result.updated} updated, ` +
    `${result.withInsights} with insights, ${result.errors.length} errors`
  );
  return result;
}

async function upsertImportedMedia(item, account, userId, token) {
  // Already imported? — find existing target by (social_account_id, platform_post_id)
  const [existing] = await pool.execute(
    `SELECT pt.id AS target_id, pt.post_id
       FROM post_targets pt
       JOIN posts p ON p.id = pt.post_id
      WHERE pt.social_account_id = ? AND pt.platform_post_id = ?`,
    [account.id, item.id]
  );

  let postId;
  let isNew = false;

  if (existing.length === 0) {
    isNew = true;
    const content = item.caption || '';
    const postType = mapMediaType(item.media_type);
    const publishedAt = item.timestamp ? new Date(item.timestamp) : new Date();

    const [postResult] = await pool.execute(
      `INSERT INTO posts (content, post_type, status, published_at, imported_from_meta,
                          created_by, team_id)
       VALUES (?, ?, 'published', ?, 1, ?, ?)`,
      [content, postType, publishedAt, userId, account.team_id || null]
    );
    postId = postResult.insertId;

    await pool.execute(
      `INSERT INTO post_targets (post_id, social_account_id, platform_post_id,
                                 status, published_at)
       VALUES (?, ?, ?, 'published', ?)`,
      [postId, account.id, item.id, publishedAt]
    );
  } else {
    postId = existing[0].post_id;
    // Refresh caption + published_at in case it changed
    const content = item.caption || '';
    const publishedAt = item.timestamp ? new Date(item.timestamp) : null;
    await pool.execute(
      `UPDATE posts SET content = ?, published_at = COALESCE(?, published_at)
        WHERE id = ?`,
      [content, publishedAt, postId]
    );
  }

  // Get the target id (we just made it or already had it)
  const [targetRows] = await pool.execute(
    `SELECT id FROM post_targets WHERE social_account_id = ? AND platform_post_id = ?`,
    [account.id, item.id]
  );
  const targetId = targetRows[0].id;

  // Pull insights (best effort — older posts may have aged out)
  const insights = await fetchInsights(item.id, item.media_type, token);
  const hadInsights = Object.keys(insights).length > 0;

  const likes = item.like_count || 0;
  const comments = item.comments_count || 0;
  const impressions = insights.impressions || 0;
  const reach = insights.reach || 0;
  const saves = insights.saves || 0;
  const engagementRate = impressions > 0
    ? Number(((likes + comments + saves) / impressions * 100).toFixed(2))
    : 0;

  // Always insert a fresh row (matches existing fetchInsightsForTarget behaviour
  // — analytics are point-in-time snapshots, not mutations).
  await pool.execute(
    `INSERT INTO post_analytics
       (post_target_id, impressions, reach, likes, comments_count, shares, saves, engagement_rate, clicks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    [targetId, impressions, reach, likes, comments, 0, saves, engagementRate]
  );

  return { created: isNew, hadInsights };
}

module.exports = { importHistory };
