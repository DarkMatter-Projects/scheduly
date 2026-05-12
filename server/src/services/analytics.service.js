const axios = require('axios');
const pool = require('../config/db');
const fb = require('../config/facebook');
const { decrypt } = require('./token.service');
const logger = require('../utils/logger');

async function fetchInsightsForTarget(postTargetId) {
  const [rows] = await pool.execute(
    `SELECT pt.platform_post_id, sa.platform, sa.access_token, sa.platform_account_id
     FROM post_targets pt
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE pt.id = ? AND pt.status = 'published' AND pt.platform_post_id IS NOT NULL`,
    [postTargetId]
  );

  if (rows.length === 0) {
    throw Object.assign(new Error('No published target found'), { status: 404 });
  }

  const target = rows[0];
  const token = decrypt(target.access_token);
  let metrics = {};

  try {
    if (target.platform === 'facebook_page') {
      metrics = await fetchFacebookInsights(target.platform_post_id, token);
    } else if (target.platform === 'instagram_business') {
      metrics = await fetchInstagramInsights(target.platform_post_id, token);
    }
  } catch (err) {
    logger.error(`Failed to fetch insights for target ${postTargetId}: ${err.message}`);
    throw err;
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

async function fetchFacebookInsights(postId, token) {
  try {
    const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${postId}/insights`, {
      params: {
        metric: 'post_impressions,post_impressions_unique,post_reactions_by_type_total,post_clicks,post_engaged_users',
        access_token: token,
      },
    });

    const metrics = {};
    for (const item of data.data || []) {
      const val = item.values?.[0]?.value;
      switch (item.name) {
        case 'post_impressions': metrics.impressions = val; break;
        case 'post_impressions_unique': metrics.reach = val; break;
        case 'post_reactions_by_type_total':
          metrics.likes = typeof val === 'object' ? Object.values(val).reduce((a, b) => a + b, 0) : val;
          break;
        case 'post_clicks': metrics.clicks = val; break;
        case 'post_engaged_users': metrics.engagements = val; break;
      }
    }

    // Calculate engagement rate
    if (metrics.impressions > 0) {
      metrics.engagementRate = ((metrics.engagements || 0) / metrics.impressions * 100).toFixed(2);
    }

    return metrics;
  } catch (err) {
    const apiError = err.response?.data?.error;
    logger.error(`Facebook insights error: ${apiError?.message || err.message}`, {
      code: apiError?.code,
      subcode: apiError?.error_subcode,
      type: apiError?.type,
      postId,
    });
    return {};
  }
}

async function fetchInstagramInsights(mediaId, token) {
  try {
    const { data } = await axios.get(`${fb.FB_GRAPH_URL}/${mediaId}/insights`, {
      params: {
        metric: 'impressions,reach,likes,comments,shares,saved',
        access_token: token,
      },
    });

    const metrics = {};
    for (const item of data.data || []) {
      const val = item.values?.[0]?.value || 0;
      switch (item.name) {
        case 'impressions': metrics.impressions = val; break;
        case 'reach': metrics.reach = val; break;
        case 'likes': metrics.likes = val; break;
        case 'comments': metrics.comments = val; break;
        case 'shares': metrics.shares = val; break;
        case 'saved': metrics.saves = val; break;
      }
    }

    if (metrics.impressions > 0) {
      const engagements = (metrics.likes || 0) + (metrics.comments || 0) + (metrics.shares || 0) + (metrics.saves || 0);
      metrics.engagementRate = (engagements / metrics.impressions * 100).toFixed(2);
    }

    return metrics;
  } catch (err) {
    const apiError = err.response?.data?.error;
    logger.error(`Instagram insights error: ${apiError?.message || err.message}`, {
      code: apiError?.code,
      subcode: apiError?.error_subcode,
      mediaId,
    });
    return {};
  }
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

async function getOverviewAnalytics(startDate, endDate, clientId = null) {
  // When a clientId is set, we restrict to posts that target any social account
  // belonging to that client. The join + DISTINCT handles posts with mixed targets.
  const clientJoin = clientId ? 'JOIN social_accounts sa ON pt.social_account_id = sa.id' : '';
  const clientWhere = clientId ? 'AND sa.client_id = ?' : '';
  const baseParams = (extra = []) => clientId
    ? [startDate, endDate, clientId, ...extra]
    : [startDate, endDate, ...extra];

  const [totals] = await pool.execute(
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
    baseParams()
  );

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
  return {
    summary: {
      totalImpressions: t.total_impressions || 0,
      totalReach: t.total_reach || 0,
      totalLikes: t.total_likes || 0,
      totalComments: t.total_comments || 0,
      totalShares: t.total_shares || 0,
      totalSaves: t.total_saves || 0,
      totalClicks: t.total_clicks || 0,
      avgEngagementRate: parseFloat(t.avg_engagement_rate) || 0,
      totalPosts: t.total_posts || 0,
    },
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
      thumbnail: p.thumbnail ? `/uploads/${p.thumbnail}` : null,
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

module.exports = { fetchInsightsForTarget, getPostAnalytics, getOverviewAnalytics };
