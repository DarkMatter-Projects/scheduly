const pool = require('../config/db');
const { metric, metricFamily } = require('./dashboard_metrics');

// Resolve which social_account ids a widget should pull from. Order:
//   1. The widget's own channel_ids (explicit user selection)
//   2. The dashboard's effective scope (union of every widget's channel_ids,
//      computed once in the controller and attached as effectiveChannelIds)
//   3. null = "all accessible accounts" (legacy fallback for widgets/dashboards
//      that never had a scope set at all)
// Returning null preserves the old behaviour for the unscoped case; returning
// a list scopes the SQL via the IN clause.
function resolveChannelIds(dashboard, widget) {
  if (Array.isArray(widget.channelIds) && widget.channelIds.length > 0) {
    return widget.channelIds.map(Number);
  }
  if (Array.isArray(dashboard?.effectiveChannelIds) && dashboard.effectiveChannelIds.length > 0) {
    return dashboard.effectiveChannelIds.map(Number);
  }
  return null;
}

// Resolve the two ends of a comparison window. If the dashboard is configured
// with a relative range like '30d', we compute it relative to "now"; if the
// dashboard has explicit range_start/end we use those.
//
// Returns dates with explicit times so the SQL BETWEEN clause includes the
// full end-day (otherwise '2026-05-21' is read as 00:00:00 and posts later
// in the day are missed).
function resolveRange(dashboard) {
  const today = new Date();
  const fmtDate = (d) => d.toISOString().slice(0, 10);

  let endDay, startDay;
  if (dashboard.range_start && dashboard.range_end) {
    startDay = String(dashboard.range_start).slice(0, 10);
    endDay = String(dashboard.range_end).slice(0, 10);
  } else {
    const days = { '7d': 7, '14d': 14, '30d': 30, '90d': 90 }[dashboard.default_range] || 30;
    endDay = fmtDate(today);
    startDay = fmtDate(new Date(today.getTime() - (days - 1) * 86400000));
  }
  // Same-length prior window immediately before [start, end].
  const sDate = new Date(startDay);
  const eDate = new Date(endDay);
  const span = Math.round((eDate - sDate) / 86400000) + 1;
  const priorEndDay = fmtDate(new Date(sDate.getTime() - 86400000));
  const priorStartDay = fmtDate(new Date(sDate.getTime() - span * 86400000));

  // Expand to full-day datetimes so BETWEEN matches DATETIME columns correctly.
  return {
    start:      `${startDay} 00:00:00`,
    end:        `${endDay} 23:59:59`,
    priorStart: `${priorStartDay} 00:00:00`,
    priorEnd:   `${priorEndDay} 23:59:59`,
    // Keep date-only versions for UIs that want them.
    startDay, endDay, priorStartDay, priorEndDay,
  };
}

// Pull totals for a metric across the supplied channel ids (or all of the
// dashboard's accessible channels if none are configured) in a range.
// Returns 0 when no data exists rather than throwing — keeps card UX clean.
async function totalForMetric(metricKey, channelIds, start, end) {
  const m = metric(metricKey);
  if (!m || m.available === false) return 0;

  // Followers data lives in follower_history (daily snapshots). Until the
  // ingestion job ships there are no rows, so this returns 0 — the cells
  // render as zeros with no delta rather than as errors.
  if (metricFamily(metricKey) === 'followers') {
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND fh.social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    try {
      if (metricKey === 'followers') {
        // Latest snapshot on or before `end`, summed across accounts in scope.
        const [rows] = await pool.execute(
          `SELECT COALESCE(SUM(latest.followers_count), 0) AS v
           FROM (
             SELECT fh.social_account_id, fh.followers_count
             FROM follower_history fh
             JOIN (
               SELECT social_account_id, MAX(snapshot_date) AS d
               FROM follower_history
               WHERE snapshot_date <= ?
               GROUP BY social_account_id
             ) lx ON lx.social_account_id = fh.social_account_id AND lx.d = fh.snapshot_date
             WHERE 1=1 ${accountsFilter}
           ) latest`,
          [end.slice(0, 10), ...(channelIds || [])]
        );
        return Number(rows[0]?.v) || 0;
      }
      if (metricKey === 'net_new_followers') {
        // (latest in range) - (latest at/before priorEnd), per account, summed.
        // Simpler: count rows in range and sum delta_count if column exists.
        const [rows] = await pool.execute(
          `SELECT COALESCE(SUM(fh.delta_count), 0) AS v
           FROM follower_history fh
           WHERE fh.snapshot_date BETWEEN ? AND ? ${accountsFilter}`,
          [start.slice(0, 10), end.slice(0, 10), ...(channelIds || [])]
        );
        return Number(rows[0]?.v) || 0;
      }
    } catch {
      // Table likely doesn't exist yet — fall through to 0.
      return 0;
    }
    return 0;
  }

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
    if (metricKey === 'interactions') {
      // Total interactions = likes + comments + shares + saves, summed.
      const [r] = await pool.execute(
        `SELECT COALESCE(SUM(pa.likes), 0)
              + COALESCE(SUM(pa.comments_count), 0)
              + COALESCE(SUM(pa.shares), 0)
              + COALESCE(SUM(pa.saves), 0) AS v
         FROM post_analytics pa
         JOIN post_targets pt ON pa.post_target_id = pt.id
         JOIN posts p ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}`,
        params
      );
      return Number(r[0]?.v) || 0;
    }
    if (metricKey === 'reach_daily_avg') {
      // Total reach across posts in the period, divided by number of days
      // in the range. Gives a stable per-day number even when reach is
      // sparse (a few big posts can otherwise dominate).
      const [r] = await pool.execute(
        `SELECT COALESCE(SUM(pa.reach), 0) AS v
         FROM post_analytics pa
         JOIN post_targets pt ON pa.post_target_id = pt.id
         JOIN posts p ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}`,
        params
      );
      const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
      return Math.round((Number(r[0]?.v) || 0) / days);
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
    if (metricKey === 'paid_reach_daily_avg') {
      const [a, b, c] = await Promise.all([
        sumIn('meta_ad_insights', 'reach'),
        sumIn('google_ad_insights', 'reach').catch(() => 0),
        sumIn('tiktok_ad_insights', 'reach').catch(() => 0),
      ]);
      const total = a + b + c;
      const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
      return Math.round(total / days);
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

  if (metricFamily(metricKey) === 'followers') {
    // Snapshots are per-account per-day; the chart sums across accounts on
    // each date. delta_count is the daily change (today - yesterday).
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    try {
      const col = metricKey === 'net_new_followers' ? 'delta_count' : 'followers_count';
      const agg = metricKey === 'net_new_followers' ? 'SUM' : 'SUM';
      const [rows] = await pool.execute(
        `SELECT snapshot_date AS date, ${agg}(${col}) AS v
         FROM follower_history
         WHERE snapshot_date BETWEEN ? AND ? ${accountsFilter}
         GROUP BY snapshot_date ORDER BY snapshot_date ASC`,
        [start.slice(0, 10), end.slice(0, 10), ...(channelIds || [])]
      );
      return rows.map(r => ({ date: r.date, value: Number(r.v) || 0 }));
    } catch {
      return [];
    }
  }

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
    if (metricKey === 'interactions') {
      // Derived: likes + comments + shares + saves per day. No interactions
      // column in post_analytics so we sum the components inline.
      const [rows] = await pool.execute(
        `SELECT DATE(p.published_at) AS date,
                COALESCE(SUM(pa.likes), 0)
              + COALESCE(SUM(pa.comments_count), 0)
              + COALESCE(SUM(pa.shares), 0)
              + COALESCE(SUM(pa.saves), 0) AS v
         FROM post_analytics pa
         JOIN post_targets pt ON pa.post_target_id = pt.id
         JOIN posts p ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}
         GROUP BY DATE(p.published_at) ORDER BY date ASC`,
        params
      );
      return rows.map(r => ({ date: r.date, value: Number(r.v) || 0 }));
    }
    if (metricKey === 'reach_daily_avg') {
      // Per-day reach. The "daily avg" framing only applies to totals — the
      // per-day series is just the daily reach value.
      const [rows] = await pool.execute(
        `SELECT DATE(p.published_at) AS date, SUM(pa.reach) AS v
         FROM post_analytics pa
         JOIN post_targets pt ON pa.post_target_id = pt.id
         JOIN posts p ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}
         GROUP BY DATE(p.published_at) ORDER BY date ASC`,
        params
      );
      return rows.map(r => ({ date: r.date, value: Number(r.v) || 0 }));
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
  const channelIds = resolveChannelIds(dashboard, widget);

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
  const channelIds = resolveChannelIds(dashboard, widget);

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
  const channelIds = resolveChannelIds(dashboard, widget);
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

// Multi-metric table — one row per channel, one column per metric, with
// current value + delta vs the prior window. The "Performance by channel"
// widget from the reference design.
async function buildChannelPerformanceTable(dashboard, widget) {
  const { start, end, priorStart, priorEnd, startDay, endDay, priorStartDay, priorEndDay } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);

  const params = [];
  let where = 'sa.is_active = 1';
  if (channelIds) {
    where += ` AND sa.id IN (${channelIds.map(() => '?').join(',')})`;
    params.push(...channelIds);
  }
  const [accounts] = await pool.execute(
    `SELECT id, platform, account_name, profile_picture_url
     FROM social_accounts sa WHERE ${where}
     ORDER BY sa.account_name ASC`,
    params
  );

  // Default columns match the "Performance by channel" reference design.
  // Old widgets without an explicit metricKeys list fall through to this
  // set so they pick up the new layout without needing to be recreated.
  const keys = Array.isArray(widget.metricKeys) && widget.metricKeys.length > 0
    ? widget.metricKeys
    : ['followers','net_new_followers','views','reach_daily_avg','interactions'];

  const columns = keys.map(k => {
    const m = metric(k);
    return {
      key: k,
      label: m?.label || k,
      format: m?.format || 'number',
      invertDelta: !!m?.invertDelta,
      description: m?.description || '',
      scope: m?.scope || 'channel',
      category: m?.category || 'channel',
    };
  });

  const rows = [];
  for (const a of accounts) {
    const cells = {};
    for (const k of keys) {
      const [current, prior] = await Promise.all([
        totalForMetric(k, [a.id], start, end),
        totalForMetric(k, [a.id], priorStart, priorEnd),
      ]);
      cells[k] = { current, prior };
    }
    rows.push({
      socialAccountId: a.id,
      accountName: a.account_name,
      platform: a.platform,
      profilePictureUrl: a.profile_picture_url,
      cells,
    });
  }

  // Aggregate totals across every account in scope, for the header row.
  // For rate-style metrics (percent / multiplier) summing makes no sense, so
  // we re-query across the union of channel ids instead — gives a true
  // weighted total rather than an average of per-channel values.
  const totalsChannelIds = accounts.map(a => a.id);
  const totals = {};
  for (const k of keys) {
    const m = metric(k);
    const isRate = m && (m.format === 'percent' || m.format === 'multiplier');
    if (isRate || totalsChannelIds.length === 0) {
      const [current, prior] = await Promise.all([
        totalForMetric(k, totalsChannelIds.length ? totalsChannelIds : null, start, end),
        totalForMetric(k, totalsChannelIds.length ? totalsChannelIds : null, priorStart, priorEnd),
      ]);
      totals[k] = { current, prior };
    } else {
      // Sum the per-row cells we already computed — saves a duplicate query.
      let current = 0;
      let prior = 0;
      for (const r of rows) {
        current += Number(r.cells[k]?.current) || 0;
        prior   += Number(r.cells[k]?.prior)   || 0;
      }
      totals[k] = { current, prior };
    }
  }

  return {
    range: { start, end, priorStart, priorEnd, startDay, endDay, priorStartDay, priorEndDay },
    columns,
    totals,
    rows,
  };
}

// Aggregate a metric across all accounts in scope, grouped by platform
// (facebook_page / instagram_business / tiktok). One row per platform.
async function buildNetworkComparison(dashboard, widget) {
  const { start, end } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);
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
  const channelIds = resolveChannelIds(dashboard, widget);
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

// Daily counts of incoming messages by sentiment — drives the stacked-area
// sentiment trend chart.
async function buildSentimentTrend(dashboard) {
  const { start, end } = resolveRange(dashboard);
  const [rows] = await pool.execute(
    `SELECT DATE(sent_at) AS date,
            SUM(CASE WHEN sentiment = 'positive' THEN 1 ELSE 0 END) AS positive,
            SUM(CASE WHEN sentiment = 'neutral'  THEN 1 ELSE 0 END) AS neutral,
            SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative
     FROM engage_messages
     WHERE direction = 'incoming' AND sent_at BETWEEN ? AND ?
     GROUP BY DATE(sent_at) ORDER BY date ASC`,
    [start, end]
  );
  return {
    range: { start, end },
    points: rows.map(r => ({
      date: r.date,
      positive: Number(r.positive) || 0,
      neutral:  Number(r.neutral) || 0,
      negative: Number(r.negative) || 0,
    })),
  };
}

// Pie/donut of positive/neutral/negative incoming-message counts in the range.
async function buildSentimentBreakdown(dashboard) {
  const { start, end } = resolveRange(dashboard);
  const [rows] = await pool.execute(
    `SELECT sentiment, COUNT(*) AS v
     FROM engage_messages
     WHERE direction = 'incoming' AND sent_at BETWEEN ? AND ?
       AND sentiment IS NOT NULL
     GROUP BY sentiment`,
    [start, end]
  );
  const map = { positive: 0, neutral: 0, negative: 0 };
  for (const r of rows) {
    if (map[r.sentiment] !== undefined) map[r.sentiment] = Number(r.v) || 0;
  }
  const total = map.positive + map.neutral + map.negative;
  return {
    range: { start, end },
    total,
    rows: [
      { sentiment: 'positive', value: map.positive, share: total > 0 ? (map.positive / total) * 100 : 0 },
      { sentiment: 'neutral',  value: map.neutral,  share: total > 0 ? (map.neutral  / total) * 100 : 0 },
      { sentiment: 'negative', value: map.negative, share: total > 0 ? (map.negative / total) * 100 : 0 },
    ],
  };
}

async function buildWidgetData(dashboard, widget) {
  switch (widget.widget_type || widget.widgetType) {
    case 'key_metrics':           return buildKeyMetrics(dashboard, widget);
    case 'time_series':           return buildTimeSeries(dashboard, widget);
    case 'channel_comparison':    return buildChannelComparison(dashboard, widget);
    case 'channel_performance_table': return buildChannelPerformanceTable(dashboard, widget);
    case 'network_comparison':    return buildNetworkComparison(dashboard, widget);
    case 'breakdown':             return buildBreakdown(dashboard, widget);
    case 'content_performance':   return buildContentPerformance(dashboard, widget);
    case 'sentiment_breakdown':   return buildSentimentBreakdown(dashboard);
    case 'sentiment_trend':       return buildSentimentTrend(dashboard);
    // Static-content widgets — config holds the payload, no DB query needed.
    case 'text_block':            return { html: (widget.config && widget.config.html) || '' };
    // Placeholders for widget types whose underlying data we don't collect
    // yet (Meta Page-level breakdowns, label system, etc.). The client
    // recognises the name and renders the friendly "no data" empty state.
    case 'label_performance':
    case 'paid_performance':
    case 'followers_by_country':
    case 'reaction_breakdown':    return { placeholder: true };
    default:                      return { unsupported: widget.widget_type || widget.widgetType };
  }
}

module.exports = { buildWidgetData, resolveRange };
