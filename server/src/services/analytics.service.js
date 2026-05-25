const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const ig = require('../config/instagram');
const { decrypt } = require('./token.service');
const storage = require('./storage.service');
const logger = require('../utils/logger');

async function fetchInsightsForTarget(postTargetId) {
  const [rows] = await pool.execute(
    `SELECT pt.platform_post_id, sa.id AS social_account_id, sa.platform,
            sa.access_token, sa.platform_account_id
     FROM post_targets pt
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE pt.id = ? AND pt.status = 'published' AND pt.platform_post_id IS NOT NULL`,
    [postTargetId]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('No published target found'), { status: 404 });
  }

  const target = rows[0];
  let metrics;

  if (target.platform === 'facebook_page') {
    metrics = await fetchFacebookInsights(target.platform_post_id, decrypt(target.access_token));
  } else if (target.platform === 'instagram_business') {
    metrics = await fetchInstagramInsights(target.platform_post_id, decrypt(target.access_token));
  } else if (target.platform === 'tiktok') {
    metrics = await fetchTiktokInsights(target.social_account_id, target.platform_post_id);
  } else {
    throw new Error(`Unsupported platform: ${target.platform}`);
  }

  // Store in database
  await pool.execute(
    `INSERT INTO post_analytics (post_target_id, impressions, reach, likes, comments_count, shares, saves, engagement_rate, clicks)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      postTargetId,
      metrics.impressions || 0,
      metrics.reach || 0,
      metrics.likes || 0,
      metrics.comments || 0,
      metrics.shares || 0,
      metrics.saves || 0,
      metrics.engagementRate || 0,
      metrics.clicks || 0,
    ]
  );

  return metrics;
}

// Per-post insights conditions that aren't recoverable (deleted post, wrong
// post type, no insights field) — we return zeros and keep iterating
// instead of failing the whole bulk refresh.
function isRecoverableFbInsightsError(apiError) {
  if (!apiError) return false;
  if (apiError.code === 100) return true; // bad post id / nonexisting field / invalid metric for type
  if (apiError.code === 33) return true;  // explicit "not found"
  return false;
}

async function fetchFacebookInsightsWithMetrics(postId, token, metricList) {
  const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${postId}/insights`, {
    params: { metric: metricList.join(','), access_token: token },
  });
  return data.data || [];
}

async function fetchFacebookInsights(postId, token) {
  // Meta retired post_impressions / post_impressions_unique in Graph v22
  // (Dec 2024). Try the modern names first; fall back to the legacy ones if
  // the post type doesn't support the new ones (Meta returns "value must be
  // a valid insights metric" for older media). Other engagement metrics are
  // stable across both eras.
  const MODERN = ['post_impressions_organic_v2','post_impressions_unique','post_reactions_by_type_total','post_clicks','post_engaged_users'];
  const LEGACY = ['post_impressions','post_impressions_unique','post_reactions_by_type_total','post_clicks','post_engaged_users'];

  let items;
  try {
    items = await fetchFacebookInsightsWithMetrics(postId, token, MODERN);
  } catch (err) {
    const apiError = err.response?.data?.error;
    // If Meta complains about the metric specifically, retry with legacy names.
    if (apiError?.code === 100 && /valid insights metric/i.test(apiError.message || '')) {
      try {
        items = await fetchFacebookInsightsWithMetrics(postId, token, LEGACY);
      } catch (retryErr) {
        const r = retryErr.response?.data?.error;
        if (isRecoverableFbInsightsError(r)) {
          logger.warn(`FB insights skipped (${r.code}/${r.error_subcode || '-'}): ${r.message} — postId=${postId}`);
          return {};
        }
        logger.error(`Facebook insights error: ${r?.message || retryErr.message}`, { code: r?.code, postId });
        throw retryErr;
      }
    } else if (isRecoverableFbInsightsError(apiError)) {
      logger.warn(`FB insights skipped (${apiError.code}/${apiError.error_subcode || '-'}): ${apiError.message} — postId=${postId}`);
      return {};
    } else {
      logger.error(`Facebook insights error: ${apiError?.message || err.message}`, { code: apiError?.code, postId });
      throw err;
    }
  }

  const metrics = {};
  for (const item of items) {
    const val = item.values?.[0]?.value;
    switch (item.name) {
      case 'post_impressions_organic_v2':
      case 'post_impressions':
        metrics.impressions = val;
        break;
      case 'post_impressions_unique': metrics.reach = val; break;
      case 'post_reactions_by_type_total':
        metrics.likes = typeof val === 'object' ? Object.values(val).reduce((a, b) => a + b, 0) : val;
        break;
      case 'post_clicks': metrics.clicks = val; break;
      case 'post_engaged_users': metrics.engagements = val; break;
    }
  }

  if (metrics.impressions > 0) {
    metrics.engagementRate = ((metrics.engagements || 0) / metrics.impressions * 100).toFixed(2);
  }
  return metrics;
}

async function fetchInstagramInsights(mediaId, token) {
  try {
    // Instagram Business Login (direct, not via FB Page) issues tokens that
    // only work against graph.instagram.com. Hitting graph.facebook.com with
    // them throws "Cannot parse access token". Use the IG graph base.
    //
    // Meta deprecated IG `impressions` in April 2025 — replacement is `views`.
    // We request both: `views` works on current API, `impressions` is harmless
    // when it's gone and helps if Meta partially still returns it on older
    // media.
    const { data } = await axios.get(`${ig.IG_GRAPH_URL}/${mediaId}/insights`, {
      params: {
        metric: 'views,reach,likes,comments,shares,saved',
        access_token: token,
      },
    });

    const metrics = {};
    for (const item of data.data || []) {
      const val = item.values?.[0]?.value || 0;
      switch (item.name) {
        case 'views':       metrics.impressions = val; break;
        case 'impressions': metrics.impressions = metrics.impressions || val; break; // fallback
        case 'reach':       metrics.reach = val; break;
        case 'likes':       metrics.likes = val; break;
        case 'comments':    metrics.comments = val; break;
        case 'shares':      metrics.shares = val; break;
        case 'saved':       metrics.saves = val; break;
      }
    }

    if (metrics.impressions > 0) {
      const engagements = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0) + (metrics.saves || 0);
      metrics.engagementRate = (engagements / metrics.impressions * 100).toFixed(2);
    }

    return metrics;
  } catch (err) {
    const apiError = err.response?.data?.error;
    const msg = apiError?.message || err.message;
    // Recoverable: deleted media, wrong account type, metric not supported
    // for this media kind. Log + skip so refreshAll doesn't fail the whole
    // batch on one bad row.
    if (apiError?.code === 100 || apiError?.code === 33) {
      logger.warn(`IG insights skipped (${apiError.code}): ${msg} — mediaId=${mediaId}`);
      return {};
    }
    logger.error(`Instagram insights error: ${msg}`, {
      code: apiError?.code,
      subcode: apiError?.error_subcode,
      mediaId,
    });
    throw Object.assign(new Error(`Instagram: ${msg}`), { code: apiError?.code });
  }
}

// TikTok insights pulled via the Display API (/v2/video/query/). publishId is
// the value we stored in post_targets.platform_post_id at init time; before
// we can query insights we need to resolve it to a publicly_available_post_id
// via /post/publish/status/fetch/. INBOX-mode posts never produce one (the
// user finishes posting in the app and we never see the final video id) so
// we just return empty metrics rather than treating that as an error.
async function fetchTiktokInsights(socialAccountId, publishId) {
  try {
    const tiktokPosting = require('./tiktok_posting.service');
    const accessToken = await tiktokPosting.ensureFreshAccessToken(socialAccountId);
    const status = await tiktokPosting.getPublishStatus(accessToken, publishId);
    const publicVideoId = status?.publicly_available_post_id;
    if (!publicVideoId) return {};

    const video = await tiktokPosting.fetchVideoInsights(socialAccountId, publicVideoId);
    if (!video) return {};

    const views = Number(video.view_count) || 0;
    const likes = Number(video.like_count) || 0;
    const comments = Number(video.comment_count) || 0;
    const shares = Number(video.share_count) || 0;
    return {
      // TikTok's Display API doesn't expose reach separately for organic
      // videos; views is the closest equivalent so we mirror it.
      impressions: views,
      reach: views,
      likes,
      comments,
      shares,
      engagementRate: views > 0
        ? ((likes + comments + shares) / views * 100).toFixed(2)
        : 0,
    };
  } catch (err) {
    logger.error(`TikTok insights error: ${err.message}`);
    throw Object.assign(new Error(`TikTok: ${err.message}`), {});
  }
}

async function refreshPostInsights(postId) {
  const [targets] = await pool.execute(
    `SELECT id FROM post_targets
     WHERE post_id = ? AND status = 'published' AND platform_post_id IS NOT NULL`,
    [postId]
  );

  if (targets.length === 0) {
    throw Object.assign(new Error('Post has no published targets to refresh'), { status: 404 });
  }

  const result = { success: 0, failed: 0, errors: [] };
  for (const t of targets) {
    try {
      await fetchInsightsForTarget(t.id);
      result.success++;
    } catch (err) {
      result.failed++;
      result.errors.push({ targetId: t.id, message: err.message });
    }
  }
  return result;
}

// Refresh insights for every published target in the last 90 days. Used by
// the manual "Refresh" action on the Analytics page to backfill after a
// metric-name change on Meta/etc.
async function refreshAllRecentInsights({ days = 90 } = {}) {
  const [targets] = await pool.execute(
    `SELECT pt.id
     FROM post_targets pt
     JOIN posts p ON pt.post_id = p.id
     WHERE pt.status = 'published'
       AND pt.platform_post_id IS NOT NULL
       AND p.published_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY p.published_at DESC`,
    [days]
  );

  const result = { total: targets.length, success: 0, failed: 0, errors: [] };
  for (const t of targets) {
    try {
      await fetchInsightsForTarget(t.id);
      result.success++;
    } catch (err) {
      result.failed++;
      result.errors.push({ targetId: t.id, message: err.message });
    }
  }
  return result;
}

async function getPostAnalytics(postId) {
  const [rows] = await pool.execute(
    `SELECT pa.*, pt.social_account_id, sa.platform, sa.account_name
     FROM post_analytics pa
     JOIN post_targets pt ON pa.post_target_id = pt.id
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE pt.post_id = ?
     ORDER BY pa.fetched_at DESC`,
    [postId]
  );

  return rows.map(r => ({
    id: r.id,
    postTargetId: r.post_target_id,
    platform: r.platform,
    accountName: r.account_name,
    impressions: r.impressions,
    reach: r.reach,
    likes: r.likes,
    commentsCount: r.comments_count,
    shares: r.shares,
    saves: r.saves,
    engagementRate: parseFloat(r.engagement_rate) || 0,
    clicks: r.clicks,
    fetchedAt: r.fetched_at,
  }));
}

// Same length window immediately before [startDate, endDate]. Used for the
// "vs prior period" deltas on the analytics overview cards.
function computePriorRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const days = Math.round((end - start) / 86400000) + 1;
  const priorEnd = new Date(start.getTime() - 86400000);
  const priorStart = new Date(priorEnd.getTime() - (days - 1) * 86400000);
  const fmt = (d) => d.toISOString().slice(0, 10);
  return { priorStart: fmt(priorStart), priorEnd: fmt(priorEnd) };
}

async function getOverviewAnalytics(startDate, endDate, clientId = null) {
  // When a clientId is set, we restrict to posts that target any social account
  // belonging to that client. The join + DISTINCT handles posts with mixed targets.
  const clientJoin = clientId ? 'JOIN social_accounts sa ON pt.social_account_id = sa.id' : '';
  const clientWhere = clientId ? 'AND sa.client_id = ?' : '';
  const paramsFor = (s, e) => clientId ? [s, e, clientId] : [s, e];
  const baseParams = (extra = []) => clientId
    ? [startDate, endDate, clientId, ...extra]
    : [startDate, endDate, ...extra];

  // Re-used for both the current period and the prior comparison period.
  async function totalsFor(s, e) {
    const [rows] = await pool.execute(
      `SELECT
         SUM(pa.impressions) AS total_impressions,
         SUM(pa.reach) AS total_reach,
         SUM(pa.likes) AS total_likes,
         SUM(pa.comments_count) AS total_comments,
         SUM(pa.shares) AS total_shares,
         SUM(pa.saves) AS total_saves,
         SUM(pa.clicks) AS total_clicks,
         AVG(pa.engagement_rate) AS avg_engagement_rate,
         COUNT(DISTINCT pt.post_id) AS total_posts
       FROM post_analytics pa
       JOIN post_targets pt ON pa.post_target_id = pt.id
       JOIN posts p ON pt.post_id = p.id
       ${clientJoin}
       WHERE p.published_at BETWEEN ? AND ? ${clientWhere}`,
      paramsFor(s, e)
    );
    return rows[0] || {};
  }

  const { priorStart, priorEnd } = computePriorRange(startDate, endDate);
  const [curTotalsRow, priorTotalsRow] = await Promise.all([
    totalsFor(startDate, endDate),
    totalsFor(priorStart, priorEnd),
  ]);
  // Keep `totals[0]` shape for the existing code below.
  const totals = [curTotalsRow];

  // Get per-post breakdown
  const [postBreakdown] = await pool.execute(
    `SELECT p.id, p.title, p.content, p.published_at, p.post_type,
            SUM(pa.impressions) AS impressions,
            SUM(pa.reach) AS reach,
            SUM(pa.likes) AS likes,
            SUM(pa.comments_count) AS comments_count,
            SUM(pa.shares) AS shares,
            AVG(pa.engagement_rate) AS engagement_rate,
            (SELECT m.thumbnail_path FROM media m JOIN post_media pm ON m.id = pm.media_id WHERE pm.post_id = p.id ORDER BY pm.sort_order LIMIT 1) AS thumbnail
     FROM posts p
     JOIN post_targets pt ON p.id = pt.post_id
     JOIN post_analytics pa ON pt.id = pa.post_target_id
     ${clientJoin}
     WHERE p.published_at BETWEEN ? AND ? ${clientWhere}
     GROUP BY p.id
     ORDER BY impressions DESC`,
    baseParams()
  );

  // Get daily aggregate for chart
  const [daily] = await pool.execute(
    `SELECT DATE(p.published_at) AS date,
            SUM(pa.impressions) AS impressions,
            SUM(pa.reach) AS reach,
            SUM(pa.likes) AS likes,
            COUNT(DISTINCT p.id) AS posts_count
     FROM posts p
     JOIN post_targets pt ON p.id = pt.post_id
     JOIN post_analytics pa ON pt.id = pa.post_target_id
     ${clientJoin}
     WHERE p.published_at BETWEEN ? AND ? ${clientWhere}
     GROUP BY DATE(p.published_at)
     ORDER BY date ASC`,
    baseParams()
  );

  // Caption sentiment distribution across published posts in the window
  // (also scoped by client when set, via post_targets/social_accounts)
  const sentimentClientFilter = clientId
    ? `AND EXISTS (
         SELECT 1 FROM post_targets pt2
         JOIN social_accounts sa2 ON pt2.social_account_id = sa2.id
         WHERE pt2.post_id = p.id AND sa2.client_id = ?
       )`
    : '';
  const sentimentParams = clientId ? [startDate, endDate, clientId] : [startDate, endDate];

  const [sentimentDist] = await pool.execute(
    `SELECT
       COALESCE(p.caption_sentiment_label, 'unknown') AS label,
       COUNT(*) AS cnt
     FROM posts p
     WHERE p.published_at BETWEEN ? AND ? ${sentimentClientFilter}
     GROUP BY COALESCE(p.caption_sentiment_label, 'unknown')`,
    sentimentParams
  );

  // Average caption sentiment per client (only clients with published posts in window)
  const byClientParams = clientId
    ? [startDate, endDate, clientId]
    : [startDate, endDate];
  const [sentimentByClient] = await pool.execute(
    `SELECT c.id, c.name, c.color,
            AVG(p.caption_sentiment_score) AS avg_score,
            COUNT(DISTINCT p.id) AS post_count,
            SUM(CASE WHEN p.caption_sentiment_label = 'positive' THEN 1 ELSE 0 END) AS positive_count,
            SUM(CASE WHEN p.caption_sentiment_label = 'neutral'  THEN 1 ELSE 0 END) AS neutral_count,
            SUM(CASE WHEN p.caption_sentiment_label = 'negative' THEN 1 ELSE 0 END) AS negative_count
     FROM clients c
     JOIN social_accounts sa ON sa.client_id = c.id
     JOIN post_targets pt   ON pt.social_account_id = sa.id
     JOIN posts p           ON pt.post_id = p.id
     WHERE p.published_at BETWEEN ? AND ? ${clientId ? 'AND c.id = ?' : ''}
     GROUP BY c.id, c.name, c.color
     ORDER BY post_count DESC, c.name ASC`,
    byClientParams
  );

  const t = totals[0] || {};
  const p = priorTotalsRow || {};
  const shapeSummary = (r) => ({
    totalImpressions: Number(r.total_impressions) || 0,
    totalReach: Number(r.total_reach) || 0,
    totalLikes: Number(r.total_likes) || 0,
    totalComments: Number(r.total_comments) || 0,
    totalShares: Number(r.total_shares) || 0,
    totalSaves: Number(r.total_saves) || 0,
    totalClicks: Number(r.total_clicks) || 0,
    avgEngagementRate: parseFloat(r.avg_engagement_rate) || 0,
    totalPosts: Number(r.total_posts) || 0,
  });
  return {
    summary: shapeSummary(t),
    priorSummary: shapeSummary(p),
    priorRange: { start: priorStart, end: priorEnd },
    posts: postBreakdown.map(p => ({
      id: p.id,
      title: p.title || p.content?.substring(0, 50),
      postType: p.post_type,
      publishedAt: p.published_at,
      impressions: p.impressions || 0,
      reach: p.reach || 0,
      likes: p.likes || 0,
      commentsCount: p.comments_count || 0,
      shares: p.shares || 0,
      engagementRate: parseFloat(p.engagement_rate) || 0,
      // Route through publicUrlFor so R2 paths resolve to absolute Cloudflare
      // URLs; hardcoding `/uploads/${p.thumbnail}` 404'd on Railway because
      // those files live in R2, not on the server's local disk.
      thumbnail: p.thumbnail ? storage.publicUrlFor(p.thumbnail) : null,
    })),
    daily: daily.map(d => ({
      date: d.date,
      impressions: d.impressions || 0,
      reach: d.reach || 0,
      likes: d.likes || 0,
      postsCount: d.posts_count || 0,
    })),
    sentiment: {
      distribution: sentimentDist.map(d => ({
        label: d.label,
        count: Number(d.cnt) || 0,
      })),
      byClient: sentimentByClient.map(c => ({
        clientId: c.id,
        clientName: c.name,
        clientColor: c.color,
        avgScore: c.avg_score != null ? Number(Number(c.avg_score).toFixed(3)) : 0,
        postCount: Number(c.post_count) || 0,
        positive: Number(c.positive_count) || 0,
        neutral: Number(c.neutral_count) || 0,
        negative: Number(c.negative_count) || 0,
      })),
    },
  };
}

module.exports = { fetchInsightsForTarget, refreshPostInsights, refreshAllRecentInsights, getPostAnalytics, getOverviewAnalytics };
