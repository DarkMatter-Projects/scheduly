const pool = require('../config/db');
const { metric, metricFamily } = require('./dashboard_metrics');

// Resolve the two ends of a comparison window. If the dashboard is configured
// with a relative range like '30d', we compute it relative to "now"; if the
// dashboard has explicit range_start/end we use those.
function resolveRange(dashboard) {
  const today = new Date();
  const fmt = (d) => d.toISOString().slice(0, 10);

  let end, start;
  if (dashboard.range_start && dashboard.range_end) {
    start = String(dashboard.range_start).slice(0, 10);
    end = String(dashboard.range_end).slice(0, 10);
  } else {
    const days = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }[dashboard.default_range] || 30;
    end = fmt(today);
    start = fmt(new Date(today.getTime() - (days - 1) * 86400000));
  }
  // Same-length prior window immediately before [start, end].
  const sDate = new Date(start);
  const eDate = new Date(end);
  const span = Math.round((eDate - sDate) / 86400000) + 1;
  const priorEnd = fmt(new Date(sDate.getTime() - 86400000));
  const priorStart = fmt(new Date(sDate.getTime() - span * 86400000));
  return { start, end, priorStart, priorEnd };
}

// Pull totals for a metric across the supplied channel ids (or all of the
// dashboard's accessible channels if none are configured) in a range.
// Returns 0 when no data exists rather than throwing — keeps card UX clean.
async function totalForMetric(metricKey, channelIds, start, end) {
  const m = metric(metricKey);
  if (!m || m.available === false) return 0;

  if (metricFamily(metricKey) === 'organic') {
    // post_analytics rows per post_target. Sum across the targets that
    // belong to the requested social_accounts.
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND pt.social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    const params = [start, end, ...(channelIds || [])];
    // Special-cases that aren't a simple SUM column.
    if (metricKey === 'posts') {
      const [r] = await pool.execute(
        `SELECT COUNT(DISTINCT p.id) AS v
         FROM posts p
         JOIN post_targets pt ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}`,
        params
      );
      return Number(r[0]?.v) || 0;
    }
    if (metricKey === 'engagement_rate') {
      const [r] = await pool.execute(
        `SELECT AVG(pa.engagement_rate) AS v
         FROM post_analytics pa
         JOIN post_targets pt ON pa.post_target_id = pt.id
         JOIN posts p ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}`,
        params
      );
      return parseFloat(r[0]?.v) || 0;
    }
    const col = m.source.split('.')[1]; // e.g. impressions, likes, comments_count
    const [rows] = await pool.execute(
      `SELECT SUM(pa.${col}) AS v
       FROM post_analytics pa
       JOIN post_targets pt ON pa.post_target_id = pt.id
       JOIN posts p ON pt.post_id = p.id
       WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}`,
      params
    );
    return Number(rows[0]?.v) || 0;
  }

  if (metricFamily(metricKey) === 'paid') {
    // We sum across Meta + Google + TikTok ad insights. Each platform has
    // its own table; query them in parallel and add.
    const sumIn = async (table, col) => {
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(${col}), 0) AS v
         FROM ${table} i
         WHERE i.level = 'account' AND i.date_start BETWEEN ? AND ?`,
        [start, end]
      );
      return Number(rows[0]?.v) || 0;
    };
    if (metricKey === 'spend') {
      const [a, b, c] = await Promise.all([
        sumIn('meta_ad_insights', 'spend'),
        sumIn('google_ad_insights', 'spend'),
        sumIn('tiktok_ad_insights', 'spend'),
      ]);
      return a + b + c;
    }
    if (metricKey === 'ad_impressions') {
      const [a, b, c] = await Promise.all([
        sumIn('meta_ad_insights', 'impressions'),
        sumIn('google_ad_insights', 'impressions'),
        sumIn('tiktok_ad_insights', 'impressions'),
      ]);
      return a + b + c;
    }
    if (metricKey === 'ad_clicks') {
      const [a, b, c] = await Promise.all([
        sumIn('meta_ad_insights', 'clicks'),
        sumIn('google_ad_insights', 'clicks'),
        sumIn('tiktok_ad_insights', 'clicks'),
      ]);
      return a + b + c;
    }
    if (metricKey === 'conversions') {
      const [a, b, c] = await Promise.all([
        sumIn('meta_ad_insights', 'conversions'),
        sumIn('google_ad_insights', 'conversions'),
        sumIn('tiktok_ad_insights', 'conversions'),
      ]);
      return a + b + c;
    }
    // Derived ones — recompute from sums.
    const [spend, impressions, clicks, conversionValue] = await Promise.all([
      totalForMetric('spend', channelIds, start, end),
      totalForMetric('ad_impressions', channelIds, start, end),
      totalForMetric('ad_clicks', channelIds, start, end),
      (async () => {
        const [m1] = await pool.execute(`SELECT COALESCE(SUM(conversion_value),0) v FROM meta_ad_insights WHERE level='account' AND date_start BETWEEN ? AND ?`, [start, end]);
        const [g1] = await pool.execute(`SELECT COALESCE(SUM(conversion_value),0) v FROM google_ad_insights WHERE level='account' AND date_start BETWEEN ? AND ?`, [start, end]);
        const [t1] = await pool.execute(`SELECT COALESCE(SUM(conversion_value),0) v FROM tiktok_ad_insights WHERE level='account' AND date_start BETWEEN ? AND ?`, [start, end]);
        return Number(m1[0].v) + Number(g1[0].v) + Number(t1[0].v);
      })(),
    ]);
    if (metricKey === 'ctr') return impressions > 0 ? (clicks / impressions) * 100 : 0;
    if (metricKey === 'cpc') return clicks > 0 ? spend / clicks : 0;
    if (metricKey === 'cpm') return impressions > 0 ? (spend / impressions) * 1000 : 0;
    if (metricKey === 'roas') return spend > 0 ? conversionValue / spend : 0;
    return 0;
  }

  if (metricFamily(metricKey) === 'engage') {
    if (metricKey === 'incoming_messages') {
      const [r] = await pool.execute(
        `SELECT COUNT(*) AS v FROM engage_messages
         WHERE direction = 'incoming' AND sent_at BETWEEN ? AND ?`,
        [start, end]
      );
      return Number(r[0]?.v) || 0;
    }
    if (metricKey === 'outgoing_replies') {
      const [r] = await pool.execute(
        `SELECT COUNT(*) AS v FROM engage_messages
         WHERE direction = 'outgoing' AND sent_at BETWEEN ? AND ?`,
        [start, end]
      );
      return Number(r[0]?.v) || 0;
    }
    if (metricKey === 'negative_sentiment_rate') {
      const [r] = await pool.execute(
        `SELECT
           SUM(CASE WHEN sentiment='negative' THEN 1 ELSE 0 END) AS neg,
           COUNT(*) AS total
         FROM engage_messages
         WHERE direction='incoming' AND sent_at BETWEEN ? AND ?`,
        [start, end]
      );
      const total = Number(r[0]?.total) || 0;
      const neg = Number(r[0]?.neg) || 0;
      return total > 0 ? (neg / total) * 100 : 0;
    }
    return 0;
  }

  return 0;
}

// Daily series for the sparkline / time-series chart. Same shape regardless
// of metric family so the client can render uniformly.
async function dailySeries(metricKey, channelIds, start, end) {
  const m = metric(metricKey);
  if (!m || m.available === false) return [];

  if (metricFamily(metricKey) === 'organic') {
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND pt.social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    const params = [start, end, ...(channelIds || [])];
    if (metricKey === 'posts') {
      const [rows] = await pool.execute(
        `SELECT DATE(p.published_at) AS date, COUNT(DISTINCT p.id) AS v
         FROM posts p
         JOIN post_targets pt ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}
         GROUP BY DATE(p.published_at) ORDER BY date ASC`,
        params
      );
      return rows.map(r => ({ date: r.date, value: Number(r.v) || 0 }));
    }
    if (metricKey === 'engagement_rate') {
      const [rows] = await pool.execute(
        `SELECT DATE(p.published_at) AS date, AVG(pa.engagement_rate) AS v
         FROM post_analytics pa
         JOIN post_targets pt ON pa.post_target_id = pt.id
         JOIN posts p ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}
         GROUP BY DATE(p.published_at) ORDER BY date ASC`,
        params
      );
      return rows.map(r => ({ date: r.date, value: parseFloat(r.v) || 0 }));
    }
    const col = m.source.split('.')[1];
    const [rows] = await pool.execute(
      `SELECT DATE(p.published_at) AS date, SUM(pa.${col}) AS v
       FROM post_analytics pa
       JOIN post_targets pt ON pa.post_target_id = pt.id
       JOIN posts p ON pt.post_id = p.id
       WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}
       GROUP BY DATE(p.published_at) ORDER BY date ASC`,
      params
    );
    return rows.map(r => ({ date: r.date, value: Number(r.v) || 0 }));
  }

  if (metricFamily(metricKey) === 'paid') {
    // Sum across all three ad insights tables per day. Slightly chunky but
    // simple — three queries then merge.
    const dailyFrom = async (table, col) => {
      const [rows] = await pool.execute(
        `SELECT date_start AS date, SUM(${col}) AS v
         FROM ${table}
         WHERE level = 'account' AND date_start BETWEEN ? AND ?
         GROUP BY date_start ORDER BY date_start ASC`,
        [start, end]
      );
      return rows.map(r => ({ date: r.date, value: Number(r.v) || 0 }));
    };
    let columnMap = { spend: 'spend', ad_impressions: 'impressions', ad_clicks: 'clicks', conversions: 'conversions' };
    const col = columnMap[metricKey];
    if (!col) return []; // derived metrics: skip time series for now
    const [a, b, c] = await Promise.all([
      dailyFrom('meta_ad_insights', col),
      dailyFrom('google_ad_insights', col),
      dailyFrom('tiktok_ad_insights', col),
    ]);
    const merged = new Map();
    for (const list of [a, b, c]) {
      for (const p of list) {
        const k = String(p.date).slice(0, 10);
        merged.set(k, (merged.get(k) || 0) + p.value);
      }
    }
    return [...merged.entries()].sort(([d1], [d2]) => d1.localeCompare(d2))
      .map(([date, value]) => ({ date, value }));
  }

  if (metricFamily(metricKey) === 'engage') {
    if (metricKey === 'incoming_messages' || metricKey === 'outgoing_replies') {
      const dir = metricKey === 'incoming_messages' ? 'incoming' : 'outgoing';
      const [rows] = await pool.execute(
        `SELECT DATE(sent_at) AS date, COUNT(*) AS v
         FROM engage_messages
         WHERE direction = ? AND sent_at BETWEEN ? AND ?
         GROUP BY DATE(sent_at) ORDER BY date ASC`,
        [dir, start, end]
      );
      return rows.map(r => ({ date: r.date, value: Number(r.v) || 0 }));
    }
  }

  return [];
}

// ── Widget builders ──

async function buildKeyMetrics(dashboard, widget) {
  const { start, end, priorStart, priorEnd } = resolveRange(dashboard);
  const keys = Array.isArray(widget.metricKeys) ? widget.metricKeys : [];
  const channelIds = Array.isArray(widget.channelIds) && widget.channelIds.length > 0
    ? widget.channelIds.map(Number)
    : null;

  const out = [];
  for (const key of keys) {
    const m = metric(key);
    if (!m) continue;
    const [current, prior, daily] = await Promise.all([
      totalForMetric(key, channelIds, start, end),
      totalForMetric(key, channelIds, priorStart, priorEnd),
      dailySeries(key, channelIds, start, end),
    ]);
    out.push({
      key,
      label: m.label,
      format: m.format,
      invertDelta: !!m.invertDelta,
      current,
      prior,
      daily,
    });
  }
  return { range: { start, end, priorStart, priorEnd }, metrics: out };
}

async function buildTimeSeries(dashboard, widget) {
  const { start, end } = resolveRange(dashboard);
  const keys = Array.isArray(widget.metricKeys) ? widget.metricKeys : [];
  const channelIds = Array.isArray(widget.channelIds) && widget.channelIds.length > 0
    ? widget.channelIds.map(Number)
    : null;

  const series = [];
  for (const key of keys) {
    const m = metric(key);
    if (!m) continue;
    const points = await dailySeries(key, channelIds, start, end);
    series.push({ key, label: m.label, format: m.format, points });
  }
  return { range: { start, end }, series };
}

async function buildChannelComparison(dashboard, widget) {
  const { start, end } = resolveRange(dashboard);
  const channelIds = Array.isArray(widget.channelIds) && widget.channelIds.length > 0
    ? widget.channelIds.map(Number)
    : null;
  const key = (widget.metricKeys && widget.metricKeys[0]) || 'impressions';
  const m = metric(key);

  // Get the candidate accounts up-front so the rows include name + platform
  // even when an account had zero data in the period.
  const params = [];
  let where = 'sa.is_active = 1';
  if (channelIds) {
    where += ` AND sa.id IN (${channelIds.map(() => '?').join(',')})`;
    params.push(...channelIds);
  }
  const [accounts] = await pool.execute(
    `SELECT id, platform, account_name FROM social_accounts sa WHERE ${where} ORDER BY sa.account_name ASC`,
    params
  );

  const rows = [];
  for (const a of accounts) {
    const v = await totalForMetric(key, [a.id], start, end);
    rows.push({
      socialAccountId: a.id,
      accountName: a.account_name,
      platform: a.platform,
      value: v,
    });
  }
  rows.sort((a, b) => b.value - a.value);
  return { range: { start, end }, metric: { key, label: m?.label || key, format: m?.format }, rows };
}

// Aggregate a metric across all accounts in scope, grouped by platform
// (facebook_page / instagram_business / tiktok). One row per platform.
async function buildNetworkComparison(dashboard, widget) {
  const { start, end } = resolveRange(dashboard);
  const channelIds = Array.isArray(widget.channelIds) && widget.channelIds.length > 0
    ? widget.channelIds.map(Number)
    : null;
  const key = (widget.metricKeys && widget.metricKeys[0]) || 'impressions';
  const m = metric(key);

  const params = [];
  let where = 'sa.is_active = 1';
  if (channelIds) {
    where += ` AND sa.id IN (${channelIds.map(() => '?').join(',')})`;
    params.push(...channelIds);
  }
  const [accounts] = await pool.execute(
    `SELECT id, platform FROM social_accounts sa WHERE ${where}`,
    params
  );

  const byPlatform = new Map();
  for (const a of accounts) {
    const v = await totalForMetric(key, [a.id], start, end);
    byPlatform.set(a.platform, (byPlatform.get(a.platform) || 0) + v);
  }
  const rows = [...byPlatform.entries()].map(([platform, value]) => ({ platform, value }));
  rows.sort((a, b) => b.value - a.value);
  return { range: { start, end }, metric: { key, label: m?.label || key, format: m?.format }, rows };
}

// Split a single metric proportionally across the accounts in scope.
// Drives the pie chart UI. Same SQL path as channel_comparison.
async function buildBreakdown(dashboard, widget) {
  const result = await buildChannelComparison(dashboard, widget);
  const total = result.rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  result.rows = result.rows.map(r => ({
    ...r,
    share: total > 0 ? (Number(r.value) / total) * 100 : 0,
  }));
  result.total = total;
  return result;
}

// Top-N posts by the chosen metric, with key insight columns alongside.
async function buildContentPerformance(dashboard, widget) {
  const { start, end } = resolveRange(dashboard);
  const channelIds = Array.isArray(widget.channelIds) && widget.channelIds.length > 0
    ? widget.channelIds.map(Number)
    : null;
  const sortKey = (widget.metricKeys && widget.metricKeys[0]) || 'engagement_rate';
  const m = metric(sortKey);

  // Map metric key → analytics column. Falls through to engagement_rate.
  const COL_MAP = {
    impressions: 'pa.impressions',
    reach: 'pa.reach',
    likes: 'pa.likes',
    comments: 'pa.comments_count',
    shares: 'pa.shares',
    saves: 'pa.saves',
    clicks: 'pa.clicks',
    engagement_rate: 'pa.engagement_rate',
  };
  const sortCol = COL_MAP[sortKey] || 'pa.engagement_rate';

  const accountsFilter = channelIds && channelIds.length > 0
    ? `AND pt.social_account_id IN (${channelIds.map(() => '?').join(',')})`
    : '';
  const params = [start, end, ...(channelIds || [])];

  const [rows] = await pool.execute(
    `SELECT p.id AS post_id,
            p.content,
            p.published_at,
            sa.platform,
            sa.account_name,
            pa.impressions,
            pa.reach,
            pa.likes,
            pa.comments_count AS comments,
            pa.shares,
            pa.saves,
            pa.engagement_rate,
            ${sortCol} AS sort_val
     FROM post_analytics pa
     JOIN post_targets pt ON pa.post_target_id = pt.id
     JOIN posts p         ON pt.post_id = p.id
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     WHERE p.published_at BETWEEN ? AND ?
       ${accountsFilter}
     ORDER BY sort_val DESC
     LIMIT 10`,
    params
  );

  return {
    range: { start, end },
    sortBy: { key: sortKey, label: m?.label || sortKey, format: m?.format },
    rows: rows.map(r => ({
      postId: r.post_id,
      content: r.content,
      publishedAt: r.published_at,
      platform: r.platform,
      accountName: r.account_name,
      impressions: Number(r.impressions) || 0,
      reach: Number(r.reach) || 0,
      likes: Number(r.likes) || 0,
      comments: Number(r.comments) || 0,
      shares: Number(r.shares) || 0,
      saves: Number(r.saves) || 0,
      engagementRate: parseFloat(r.engagement_rate) || 0,
      sortValue: Number(r.sort_val) || 0,
    })),
  };
}

async function buildWidgetData(dashboard, widget) {
  switch (widget.widget_type || widget.widgetType) {
    case 'key_metrics':           return buildKeyMetrics(dashboard, widget);
    case 'time_series':           return buildTimeSeries(dashboard, widget);
    case 'channel_comparison':    return buildChannelComparison(dashboard, widget);
    case 'network_comparison':    return buildNetworkComparison(dashboard, widget);
    case 'breakdown':             return buildBreakdown(dashboard, widget);
    case 'content_performance':   return buildContentPerformance(dashboard, widget);
    default:                      return { unsupported: widget.widget_type || widget.widgetType };
  }
}

module.exports = { buildWidgetData, resolveRange };
