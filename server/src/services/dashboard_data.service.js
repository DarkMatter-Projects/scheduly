const pool = require('../config/db');
const { metric, metricFamily } = require('./dashboard_metrics');
const storage = require('./storage.service');

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

  // Page-level insights from channel_insights_daily (engaged_users,
  // profile_views, profile_taps, follower_views, non_follower_views).
  // Each one is a daily SUM across the range; rates are computed from
  // the daily reach_unique column.
  const CI_COLUMN = {
    engaged_users_daily_avg: 'engaged_users',
    channel_profile_views:   'profile_views',
    profile_taps:            'profile_taps',
    profile_cta_clicks:      'profile_taps',
    follower_views:          'follower_views',
    non_follower_views:      'non_follower_views',
    video_views:             'video_views',
    video_viewers:           'video_views_unique',
    video_watch_time:        'video_view_time',
    repeated_video_views:    'video_repeat_views',
    organic_impressions:     'impressions_organic',
    paid_impressions:        'impressions_paid',
    viral_impressions:       'impressions_viral',
    non_viral_impressions:   'impressions_nonviral',
    paid_fans_increase:      'paid_fans_added',
    unpaid_fans_increase:    'unpaid_fans_added',
    story_replies_mentions:  'story_replies',
    reposts:                 'story_shares',
    engage_fan_posts:        'fan_posts_count',
    engage_reviews:          'reviews_count',
    blocked_dm_conversations:'blocked_dm_count',
    organic_net_followers:   'linkedin_organic_gain',
    paid_net_followers:      'linkedin_paid_gain',
    paid_video_views_3s:     'video_views_paid',
    organic_video_views_3s:  'video_views_organic',
    video_views_10s:         'video_views_10s',
    video_views_30s:         'video_views_30s',
  };
  if (CI_COLUMN[metricKey]) {
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    try {
      const col = CI_COLUMN[metricKey];
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(${col}), 0) AS v
         FROM channel_insights_daily
         WHERE snapshot_date BETWEEN ? AND ? ${accountsFilter}`,
        [start.slice(0, 10), end.slice(0, 10), ...(channelIds || [])]
      );
      return Number(rows[0]?.v) || 0;
    } catch {
      return 0;
    }
  }
  // X account stats — `following` is a snapshot count (latest value in
  // range), `net_tweets_retweets` and `net_listed` are deltas across
  // the range (latest − earliest).
  if (metricKey === 'following') {
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    try {
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(latest.following_count), 0) AS v
         FROM (
           SELECT cid.social_account_id, cid.following_count
           FROM channel_insights_daily cid
           JOIN (
             SELECT social_account_id, MAX(snapshot_date) AS d
             FROM channel_insights_daily
             WHERE snapshot_date <= ? AND following_count IS NOT NULL
             GROUP BY social_account_id
           ) lx ON lx.social_account_id = cid.social_account_id AND lx.d = cid.snapshot_date
           WHERE 1=1 ${accountsFilter}
         ) latest`,
        [end.slice(0, 10), ...(channelIds || [])]
      );
      return Number(rows[0]?.v) || 0;
    } catch { return 0; }
  }
  if (metricKey === 'net_tweets_retweets' || metricKey === 'net_listed') {
    const col = metricKey === 'net_tweets_retweets' ? 'tweet_count' : 'listed_count';
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    try {
      // Per-account: (latest snapshot in range) - (earliest in range),
      // summed across accounts. NULL snapshots are skipped via the
      // IS NOT NULL filter.
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(last_in_range.${col} - first_in_range.${col}), 0) AS v
         FROM (
           SELECT social_account_id, MAX(snapshot_date) AS d
           FROM channel_insights_daily
           WHERE snapshot_date BETWEEN ? AND ? AND ${col} IS NOT NULL ${accountsFilter}
           GROUP BY social_account_id
         ) lx
         JOIN channel_insights_daily last_in_range
           ON last_in_range.social_account_id = lx.social_account_id
          AND last_in_range.snapshot_date = lx.d
         JOIN (
           SELECT social_account_id, MIN(snapshot_date) AS d
           FROM channel_insights_daily
           WHERE snapshot_date BETWEEN ? AND ? AND ${col} IS NOT NULL ${accountsFilter}
           GROUP BY social_account_id
         ) fx ON fx.social_account_id = lx.social_account_id
         JOIN channel_insights_daily first_in_range
           ON first_in_range.social_account_id = fx.social_account_id
          AND first_in_range.snapshot_date = fx.d`,
        [start.slice(0, 10), end.slice(0, 10), ...(channelIds || []),
         start.slice(0, 10), end.slice(0, 10), ...(channelIds || [])]
      );
      return Number(rows[0]?.v) || 0;
    } catch { return 0; }
  }

  // Daily-average reach breakdowns — sum the daily column, divide by days.
  const REACH_DAILY_COLUMN = {
    organic_reach_daily:        'reach_organic',
    viral_reach_daily_avg:      'reach_viral',
    non_viral_reach_daily_avg:  'reach_nonviral',
  };
  if (REACH_DAILY_COLUMN[metricKey]) {
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    try {
      const col = REACH_DAILY_COLUMN[metricKey];
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(${col}), 0) AS v
         FROM channel_insights_daily
         WHERE snapshot_date BETWEEN ? AND ? ${accountsFilter}`,
        [start.slice(0, 10), end.slice(0, 10), ...(channelIds || [])]
      );
      const total = Number(rows[0]?.v) || 0;
      const days = Math.max(1, Math.round((new Date(end) - new Date(start)) / 86400000) + 1);
      return Math.round(total / days);
    } catch { return 0; }
  }
  if (metricKey === 'viral_amplification') {
    // viral_impressions / total_impressions * 100 — % of impressions
    // attributable to viral (i.e. shared) distribution.
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    try {
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(impressions_viral), 0)    AS v,
                COALESCE(SUM(impressions_organic), 0)
              + COALESCE(SUM(impressions_paid), 0)     AS total
         FROM channel_insights_daily
         WHERE snapshot_date BETWEEN ? AND ? ${accountsFilter}`,
        [start.slice(0, 10), end.slice(0, 10), ...(channelIds || [])]
      );
      const viral = Number(rows[0]?.v) || 0;
      const total = Number(rows[0]?.total) || 0;
      return total > 0 ? (viral / total) * 100 : 0;
    } catch { return 0; }
  }
  if (metricKey === 'engaged_users_rate') {
    // engaged_users / reach_unique * 100 across the range.
    const accountsFilter = channelIds && channelIds.length > 0
      ? `AND social_account_id IN (${channelIds.map(() => '?').join(',')})`
      : '';
    try {
      const [rows] = await pool.execute(
        `SELECT COALESCE(SUM(engaged_users),0) AS e, COALESCE(SUM(reach_unique),0) AS r
         FROM channel_insights_daily
         WHERE snapshot_date BETWEEN ? AND ? ${accountsFilter}`,
        [start.slice(0, 10), end.slice(0, 10), ...(channelIds || [])]
      );
      const e = Number(rows[0]?.e) || 0;
      const r = Number(rows[0]?.r) || 0;
      return r > 0 ? (e / r) * 100 : 0;
    } catch {
      return 0;
    }
  }

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
      if (metricKey === 'followers_increase') {
        // Sum of positive daily deltas — best proxy for follower gain
        // when the platform doesn't return separate gained/lost numbers.
        const [rows] = await pool.execute(
          `SELECT COALESCE(SUM(CASE WHEN fh.delta_count > 0 THEN fh.delta_count ELSE 0 END), 0) AS v
           FROM follower_history fh
           WHERE fh.snapshot_date BETWEEN ? AND ? ${accountsFilter}`,
          [start.slice(0, 10), end.slice(0, 10), ...(channelIds || [])]
        );
        return Number(rows[0]?.v) || 0;
      }
      if (metricKey === 'followers_decrease') {
        const [rows] = await pool.execute(
          `SELECT COALESCE(SUM(CASE WHEN fh.delta_count < 0 THEN -fh.delta_count ELSE 0 END), 0) AS v
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
    if (metricKey === 'interaction_rate' || metricKey === 'engagement_rate_reach' || metricKey === 'interaction_rate_reach') {
      // Derived from per-row sums. interaction_rate = Σinteractions / Σviews
      // *both* engagement_rate_reach and interaction_rate_reach divide by reach.
      const [r] = await pool.execute(
        `SELECT COALESCE(SUM(pa.likes), 0)
              + COALESCE(SUM(pa.comments_count), 0)
              + COALESCE(SUM(pa.shares), 0)
              + COALESCE(SUM(pa.saves), 0) AS i,
                COALESCE(SUM(pa.impressions), 0) AS v,
                COALESCE(SUM(pa.reach), 0) AS r
         FROM post_analytics pa
         JOIN post_targets pt ON pa.post_target_id = pt.id
         JOIN posts p ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}`,
        params
      );
      const i = Number(r[0]?.i) || 0;
      const v = Number(r[0]?.v) || 0;
      const reach = Number(r[0]?.r) || 0;
      if (metricKey === 'interaction_rate')        return v > 0 ? (i / v) * 100 : 0;
      if (metricKey === 'interaction_rate_reach') return reach > 0 ? (i / reach) * 100 : 0;
      if (metricKey === 'engagement_rate_reach')  return reach > 0 ? (i / reach) * 100 : 0;
      return 0;
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
    // Subtype counters share the same query shape — only the
    // source_type filter changes per metric. fan_post / review / blocked
    // intentionally stay null (available:false) because we don't ingest
    // those classifications yet.
    const SOURCE_TYPE_FILTER = {
      engage_direct_messages:   "source_type = 'dm'",
      engage_comments_inbox:    "source_type = 'comment'",
      engage_mentions:          "source_type = 'mention'",
    };
    if (SOURCE_TYPE_FILTER[metricKey]) {
      const [r] = await pool.execute(
        `SELECT COUNT(*) AS v
         FROM engage_messages m
         JOIN engage_threads t ON m.thread_id = t.id
         WHERE m.direction = 'incoming'
           AND m.sent_at BETWEEN ? AND ?
           AND t.${SOURCE_TYPE_FILTER[metricKey]}`,
        [start, end]
      );
      return Number(r[0]?.v) || 0;
    }
    if (metricKey === 'new_dm_conversations') {
      // Distinct DM threads whose FIRST incoming message landed inside
      // the range. Doesn't catch threads where users replied earlier
      // but the conversation only "opened" by our definition here.
      const [r] = await pool.execute(
        `SELECT COUNT(*) AS v FROM (
           SELECT t.id, MIN(m.sent_at) AS first_at
           FROM engage_threads t
           JOIN engage_messages m ON m.thread_id = t.id AND m.direction = 'incoming'
           WHERE t.source_type = 'dm'
           GROUP BY t.id
           HAVING first_at BETWEEN ? AND ?
         ) sub`,
        [start, end]
      );
      return Number(r[0]?.v) || 0;
    }
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

  // Look up which platforms the widget's actual channels live on so we
  // only show icons for platforms in scope. Without this every KPI card
  // would show every platform the *metric* supports, which is misleading
  // for single-platform dashboards (IG / FB / TT-only templates).
  const inScopePlatforms = await resolveInScopePlatforms(channelIds);

  const out = [];
  for (const key of keys) {
    const m = metric(key);
    if (!m) continue;
    const [current, prior, daily] = await Promise.all([
      totalForMetric(key, channelIds, start, end),
      totalForMetric(key, channelIds, priorStart, priorEnd),
      dailySeries(key, channelIds, start, end),
    ]);
    const supported = Array.isArray(m.platforms) ? m.platforms : [];
    // Intersect metric.platforms with the dashboard's scoped platforms.
    // Fall back to the metric's full list when the dashboard has no
    // scope at all (legacy "Build your own" empty-scope dashboards).
    const platforms = inScopePlatforms.length > 0
      ? supported.filter(p => inScopePlatforms.includes(p))
      : supported;
    out.push({
      key,
      label: m.label,
      format: m.format,
      invertDelta: !!m.invertDelta,
      scope: m.scope || 'channel',
      platforms,
      current,
      prior,
      daily,
    });
  }
  return { range: { start, end, priorStart, priorEnd }, metrics: out };
}

// Distinct list of platform strings for the supplied social_account ids.
// Returns [] when channelIds is null/empty so the caller can fall back.
async function resolveInScopePlatforms(channelIds) {
  if (!Array.isArray(channelIds) || channelIds.length === 0) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT platform FROM social_accounts
     WHERE id IN (${channelIds.map(() => '?').join(',')})`,
    channelIds
  );
  return rows.map(r => r.platform).filter(Boolean);
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

// Top profiles ranked by Engagement Rate (Reach). Each row is one
// social account with its ERR and delta vs prior period — used by the
// "Top ERR Profiles" widget on the IG template.
async function buildTopErrProfiles(dashboard, widget) {
  const { start, end, priorStart, priorEnd } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);
  const params = [];
  let where = 'sa.is_active = 1';
  if (channelIds) {
    where += ` AND sa.id IN (${channelIds.map(() => '?').join(',')})`;
    params.push(...channelIds);
  }
  const [accounts] = await pool.execute(
    `SELECT id, platform, account_name, profile_picture_url
     FROM social_accounts sa WHERE ${where} ORDER BY sa.account_name ASC`,
    params
  );

  const rows = [];
  for (const a of accounts) {
    const [current, prior] = await Promise.all([
      totalForMetric('engagement_rate_reach', [a.id], start, end),
      totalForMetric('engagement_rate_reach', [a.id], priorStart, priorEnd),
    ]);
    rows.push({
      socialAccountId: a.id,
      accountName: a.account_name,
      platform: a.platform,
      profilePictureUrl: a.profile_picture_url,
      current,
      prior,
    });
  }
  rows.sort((a, b) => b.current - a.current);

  // Header pill — engagement rate aggregated across the whole scope.
  const [totalCurrent, totalPrior] = await Promise.all([
    totalForMetric('engagement_rate_reach', accounts.map(a => a.id), start, end),
    totalForMetric('engagement_rate_reach', accounts.map(a => a.id), priorStart, priorEnd),
  ]);
  return {
    range: { start, end, priorStart, priorEnd },
    total: { current: totalCurrent, prior: totalPrior },
    rows,
  };
}

// Aggregate a metric grouped by posts.post_type. Drives the "X by post
// type" bar charts on the IG template. The metricKey controls which
// metric is summed; only post_analytics-backed metrics make sense.
async function buildMetricByPostType(dashboard, widget) {
  const { start, end, priorStart, priorEnd } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);
  const key = (widget.metricKeys && widget.metricKeys[0]) || 'interactions';
  const m = metric(key);
  const accountsFilter = channelIds && channelIds.length > 0
    ? `AND pt.social_account_id IN (${channelIds.map(() => '?').join(',')})`
    : '';

  // Pull post-type breakdown for both windows in one round-trip per window.
  // Interactions / engagement_rate_reach are derived — handle them inline
  // instead of via totalForMetric (which doesn't accept a post_type filter).
  const COMPONENT = {
    interactions:        `(COALESCE(SUM(pa.likes),0)+COALESCE(SUM(pa.comments_count),0)+COALESCE(SUM(pa.shares),0)+COALESCE(SUM(pa.saves),0))`,
    impressions:         `COALESCE(SUM(pa.impressions),0)`,
    views:               `COALESCE(SUM(pa.impressions),0)`,
    organic_views:       `COALESCE(SUM(pa.impressions),0)`,
    reach:               `COALESCE(SUM(pa.reach),0)`,
    reach_daily_avg:     `COALESCE(SUM(pa.reach),0)`, // div-by-days happens later
    likes:               `COALESCE(SUM(pa.likes),0)`,
    comments:            `COALESCE(SUM(pa.comments_count),0)`,
    shares:              `COALESCE(SUM(pa.shares),0)`,
    saves:               `COALESCE(SUM(pa.saves),0)`,
  };
  const expr = COMPONENT[key];
  const isRate = m?.format === 'percent';

  async function fetchByType(s, e) {
    if (isRate) {
      // For rate metrics return interactions and reach per post_type so we
      // can compute pct = interactions/reach*100 client-side.
      const [rows] = await pool.execute(
        `SELECT p.post_type AS type,
                (COALESCE(SUM(pa.likes),0)+COALESCE(SUM(pa.comments_count),0)+COALESCE(SUM(pa.shares),0)+COALESCE(SUM(pa.saves),0)) AS i,
                COALESCE(SUM(pa.reach),0) AS r,
                COALESCE(SUM(pa.impressions),0) AS v
         FROM post_analytics pa
         JOIN post_targets pt ON pa.post_target_id = pt.id
         JOIN posts p ON pt.post_id = p.id
         WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}
         GROUP BY p.post_type`,
        [s, e, ...(channelIds || [])]
      );
      return rows.map(r => {
        const i = Number(r.i) || 0;
        const reach = Number(r.r) || 0;
        const views = Number(r.v) || 0;
        let value = 0;
        if (key === 'engagement_rate_reach' || key === 'interaction_rate_reach') {
          value = reach > 0 ? (i / reach) * 100 : 0;
        } else if (key === 'interaction_rate') {
          value = views > 0 ? (i / views) * 100 : 0;
        }
        return { type: r.type, value };
      });
    }
    if (!expr) return [];
    const [rows] = await pool.execute(
      `SELECT p.post_type AS type, ${expr} AS v
       FROM post_analytics pa
       JOIN post_targets pt ON pa.post_target_id = pt.id
       JOIN posts p ON pt.post_id = p.id
       WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}
       GROUP BY p.post_type`,
      [s, e, ...(channelIds || [])]
    );
    return rows.map(r => ({ type: r.type, value: Number(r.v) || 0 }));
  }

  const [currentByType, priorByType] = await Promise.all([
    fetchByType(start, end),
    fetchByType(priorStart, priorEnd),
  ]);

  // Always include the baseline IG post types so users see Carousel /
  // Reel / Story / Photo or video buckets even when they haven't
  // published one of them this period — empty bars communicate "zero
  // here" rather than "no such category".
  const BASELINE_TYPES = ['carousel', 'image', 'reel', 'story'];
  const types = new Set([
    ...BASELINE_TYPES,
    ...currentByType.map(r => r.type),
    ...priorByType.map(r => r.type),
  ]);
  // 'image' and 'video' both render under "Photo or video", collapse them
  // so we don't show duplicate bars with the same label.
  const collapsed = new Map();
  for (const t of [...types].filter(Boolean)) {
    const display = t === 'video' ? 'image' : t;
    if (!collapsed.has(display)) collapsed.set(display, []);
    collapsed.get(display).push(t);
  }
  const rows = [...collapsed.entries()].map(([displayType, sourceTypes]) => {
    const cur = sourceTypes.reduce((s, st) => s + (currentByType.find(r => r.type === st)?.value || 0), 0);
    const pri = sourceTypes.reduce((s, st) => s + (priorByType.find(r => r.type === st)?.value   || 0), 0);
    return { postType: displayType, current: cur, prior: pri };
  });
  rows.sort((a, b) => b.current - a.current);
  return {
    range: { start, end, priorStart, priorEnd },
    metric: { key, label: m?.label || key, format: m?.format || 'number' },
    rows,
  };
}

// Same as buildMetricByPostType but daily — one series per post type
// over the date range. Drives the "X by post type over time" line/area
// charts. Handles count + rate metrics; rate metrics compute
// interactions/reach per (day, post_type).
async function buildMetricByPostTypeOverTime(dashboard, widget) {
  const { start, end } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);
  const key = (widget.metricKeys && widget.metricKeys[0]) || 'interactions';
  const m = metric(key);
  const accountsFilter = channelIds && channelIds.length > 0
    ? `AND pt.social_account_id IN (${channelIds.map(() => '?').join(',')})`
    : '';
  const params = [start, end, ...(channelIds || [])];

  const isRate = key === 'engagement_rate_reach' || key === 'interaction_rate' || key === 'interaction_rate_reach';

  // Pull per-day per-post_type sums of interactions, reach and views so a
  // single query covers all metrics — count metrics pick the right column,
  // rate metrics derive from interactions / (reach or views).
  const [rows] = await pool.execute(
    `SELECT DATE(p.published_at) AS date, p.post_type AS type,
            (COALESCE(SUM(pa.likes),0)+COALESCE(SUM(pa.comments_count),0)+COALESCE(SUM(pa.shares),0)+COALESCE(SUM(pa.saves),0)) AS i,
            COALESCE(SUM(pa.reach),0)        AS r,
            COALESCE(SUM(pa.impressions),0)  AS v,
            COALESCE(SUM(pa.likes),0)        AS likes,
            COALESCE(SUM(pa.comments_count),0) AS comments,
            COALESCE(SUM(pa.shares),0)       AS shares,
            COALESCE(SUM(pa.saves),0)        AS saves
     FROM post_analytics pa
     JOIN post_targets pt ON pa.post_target_id = pt.id
     JOIN posts p ON pt.post_id = p.id
     WHERE p.published_at BETWEEN ? AND ? ${accountsFilter}
     GROUP BY DATE(p.published_at), p.post_type
     ORDER BY date ASC`,
    params
  );

  function valueOf(row) {
    if (key === 'engagement_rate_reach' || key === 'interaction_rate_reach') {
      return row.r > 0 ? (row.i / row.r) * 100 : 0;
    }
    if (key === 'interaction_rate')               return row.v > 0 ? (row.i / row.v) * 100 : 0;
    if (key === 'interactions')                   return row.i;
    if (key === 'impressions' || key === 'views') return Number(row.v) || 0;
    if (key === 'reach' || key === 'reach_daily_avg') return Number(row.r) || 0;
    if (key === 'likes')    return Number(row.likes) || 0;
    if (key === 'comments') return Number(row.comments) || 0;
    if (key === 'shares')   return Number(row.shares) || 0;
    return 0;
  }

  // Distinct dates from organic; the post-type axis always shows the four
  // baseline IG buckets (Carousel / Photo or video / Reel / Story) plus
  // anything else the data surfaces, so users see "zero here" bars rather
  // than vanished categories.
  const dates = [...new Set(rows.map(r => String(r.date).slice(0,10)))].sort();
  const BASELINE_TYPES = ['carousel', 'image', 'reel', 'story'];
  const sourceTypes = [...new Set([...BASELINE_TYPES, ...rows.map(r => r.type).filter(Boolean)])];
  // Collapse 'video' onto 'image' since both render as "Photo or video".
  const collapsed = new Map();
  for (const t of sourceTypes) {
    const display = t === 'video' ? 'image' : t;
    if (!collapsed.has(display)) collapsed.set(display, []);
    collapsed.get(display).push(t);
  }
  const series = [...collapsed.entries()].map(([displayType, srcTypes]) => ({
    key: displayType,
    label: `${POST_TYPE_LABEL[displayType] || displayType} ${(m?.label || key)}`,
    points: dates.map(d => {
      let value = 0;
      for (const st of srcTypes) {
        const hit = rows.find(r => r.type === st && String(r.date).slice(0,10) === d);
        if (hit) {
          // For rate metrics we have to (re)compute per stitched row instead
          // of summing two ratios. Aggregate the i/r/v components first.
          if (isRate) {
            // Accumulate components, compute ratio after the loop.
            value = value; // placeholder — handled below
          } else {
            value += Number(valueOf(hit)) || 0;
          }
        }
      }
      if (isRate) {
        let i = 0, r = 0, v = 0;
        for (const st of srcTypes) {
          const hit = rows.find(rr => rr.type === st && String(rr.date).slice(0,10) === d);
          if (hit) { i += Number(hit.i)||0; r += Number(hit.r)||0; v += Number(hit.v)||0; }
        }
        if (key === 'interaction_rate') value = v > 0 ? (i / v) * 100 : 0;
        else                            value = r > 0 ? (i / r) * 100 : 0;
      }
      return { date: d, value };
    }),
  }));

  // Optional Paid series from meta_ad_insights so the chart matches the
  // reference legend (Reel / Story / Photo or video / Paid). Skipped for
  // metrics where a paid equivalent doesn't make sense.
  if (PAID_SERIES_SUPPORTED.has(key)) {
    const [paidRows] = await pool.execute(
      `SELECT date_start AS date,
              COALESCE(SUM(impressions), 0) AS v,
              COALESCE(SUM(reach), 0)       AS r,
              COALESCE(SUM(clicks), 0)      AS clicks
       FROM meta_ad_insights
       WHERE level = 'account' AND date_start BETWEEN ? AND ?
       GROUP BY date_start ORDER BY date_start ASC`,
      [start, end]
    );
    const paidPoints = dates.map(d => {
      const hit = paidRows.find(p => String(p.date).slice(0,10) === d);
      if (!hit) return { date: d, value: 0 };
      const v = Number(hit.v) || 0;
      const r = Number(hit.r) || 0;
      const clicks = Number(hit.clicks) || 0;
      let value = 0;
      if (key === 'engagement_rate_reach' || key === 'interaction_rate_reach') value = r > 0 ? (clicks / r) * 100 : 0;
      else if (key === 'interaction_rate')                                     value = v > 0 ? (clicks / v) * 100 : 0;
      else if (key === 'reach' || key === 'reach_daily_avg')                   value = r;
      else if (key === 'impressions' || key === 'views')                       value = v;
      else if (key === 'interactions')                                         value = clicks;
      return { date: d, value };
    });
    // Always emit the Paid series so the legend matches the design even
    // on dates where the account hasn't spent on ads. Zero points read as
    // a flat baseline rather than a missing category.
    series.push({
      key: 'paid',
      label: `Paid ${(m?.label || key)}`,
      points: paidPoints,
    });
  }

  return {
    range: { start, end },
    metric: { key, label: m?.label || key, format: m?.format || 'number' },
    series,
  };
}

// Mirrors the client-side POST_TYPE_LABEL — kept here so the server can
// build human-readable legend labels without an extra round-trip.
const POST_TYPE_LABEL = {
  text:     'Text',
  image:    'Photo or video',
  video:    'Photo or video',
  carousel: 'Carousel',
  reel:     'Reel',
  story:    'Story',
};

// Metrics where the Paid (meta_ad_insights) overlay makes sense.
const PAID_SERIES_SUPPORTED = new Set([
  'engagement_rate_reach', 'interaction_rate_reach', 'interaction_rate',
  'reach', 'reach_daily_avg', 'impressions', 'views', 'interactions',
]);

// Per-channel breakdown of engagement metrics by post type. Each row is
// one social account; columns are post_type-prefixed engagement counts.
async function buildEngagementsByProfile(dashboard, widget) {
  const { start, end, priorStart, priorEnd } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);
  const params = [];
  let where = 'sa.is_active = 1';
  if (channelIds) {
    where += ` AND sa.id IN (${channelIds.map(() => '?').join(',')})`;
    params.push(...channelIds);
  }
  const [accounts] = await pool.execute(
    `SELECT id, platform, account_name, profile_picture_url
     FROM social_accounts sa WHERE ${where} ORDER BY sa.account_name ASC`,
    params
  );

  // Sum interactions per (social_account, post_type) for both windows in
  // one query each (avoids N*M round-trips).
  async function fetchByAccountType(s, e) {
    const [rows] = await pool.execute(
      `SELECT pt.social_account_id AS sid, p.post_type AS type,
              (COALESCE(SUM(pa.likes),0)+COALESCE(SUM(pa.comments_count),0)+COALESCE(SUM(pa.shares),0)+COALESCE(SUM(pa.saves),0)) AS v
       FROM post_analytics pa
       JOIN post_targets pt ON pa.post_target_id = pt.id
       JOIN posts p ON pt.post_id = p.id
       WHERE p.published_at BETWEEN ? AND ?
         ${channelIds ? `AND pt.social_account_id IN (${channelIds.map(() => '?').join(',')})` : ''}
       GROUP BY pt.social_account_id, p.post_type`,
      [s, e, ...(channelIds || [])]
    );
    const map = new Map();
    for (const r of rows) {
      const k = `${r.sid}|${r.type}`;
      map.set(k, Number(r.v) || 0);
    }
    return map;
  }
  const [curMap, priMap] = await Promise.all([
    fetchByAccountType(start, end),
    fetchByAccountType(priorStart, priorEnd),
  ]);

  // Always include the four baseline IG post-type columns + a Paid
  // column so the widget structure matches the reference design even
  // when a profile has no posts in a category yet.
  const BASELINE_COLUMNS = ['reel', 'story', 'image', 'carousel'];
  const observed = new Set();
  for (const k of [...curMap.keys(), ...priMap.keys()]) {
    const t = k.split('|')[1];
    if (t) observed.add(t);
  }
  // Collapse 'video' into 'image' (both render as "Photo or video").
  const wantsImage = observed.has('image') || observed.has('video');
  const columns = [...new Set([
    ...BASELINE_COLUMNS,
    ...(wantsImage ? ['image'] : []),
    ...[...observed].filter(t => !['video','image'].includes(t)),
  ])];

  // Helper: pull cell value for a given account + display column,
  // collapsing 'video' rows into the 'image' bucket.
  const cellValue = (map, accountId, displayCol) => {
    if (displayCol === 'image') {
      return (map.get(`${accountId}|image`) || 0) + (map.get(`${accountId}|video`) || 0);
    }
    return map.get(`${accountId}|${displayCol}`) || 0;
  };

  const rows = accounts.map(a => {
    const cells = {};
    for (const t of columns) {
      cells[t] = {
        current: cellValue(curMap, a.id, t),
        prior:   cellValue(priMap, a.id, t),
      };
    }
    return {
      socialAccountId: a.id,
      accountName: a.account_name,
      platform: a.platform,
      profilePictureUrl: a.profile_picture_url,
      cells,
    };
  });

  // Totals row (sum across accounts).
  const totals = {};
  for (const t of columns) {
    let c = 0, p = 0;
    for (const r of rows) {
      c += r.cells[t].current;
      p += r.cells[t].prior;
    }
    totals[t] = { current: c, prior: p };
  }

  // Paid column: attribute ad clicks (best proxy for "engagements" we
  // have in meta_ad_insights) to a dashboard-wide total since the schema
  // doesn't tie ad accounts back to a specific social_account_id.
  try {
    const sumClicks = async (s, e) => {
      const [r] = await pool.execute(
        `SELECT COALESCE(SUM(clicks),0) AS v
         FROM meta_ad_insights
         WHERE level='account' AND date_start BETWEEN ? AND ?`,
        [s, e]
      );
      return Number(r[0]?.v) || 0;
    };
    const [paidCur, paidPri] = await Promise.all([
      sumClicks(start, end),
      sumClicks(priorStart, priorEnd),
    ]);
    columns.push('paid');
    totals.paid = { current: paidCur, prior: paidPri };
    // Per-row paid cells remain null because we can't attribute ad
    // spend to a specific social profile from our schema.
    for (const r of rows) r.cells.paid = { current: null, prior: null };
  } catch { /* ignore — ads optional */ }

  return {
    range: { start, end, priorStart, priorEnd },
    columns,
    totals,
    rows,
  };
}

// Top posts in the range whose post_type is in the supplied list.
// Drives the Reels performance + Story performance cards. Same column
// shape as content_performance so the client can reuse the renderer.
async function buildPostTypePerformance(dashboard, widget, types) {
  const { start, end } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);
  const accountsFilter = channelIds && channelIds.length > 0
    ? `AND pt.social_account_id IN (${channelIds.map(() => '?').join(',')})`
    : '';
  const typePlaceholders = types.map(() => '?').join(',');
  const params = [start, end, ...(channelIds || []), ...types];

  const [rows] = await pool.execute(
    `SELECT p.id AS post_id,
            p.content,
            p.post_type,
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
            m.file_path       AS media_file_path,
            m.thumbnail_path  AS media_thumb_path,
            m.mime_type       AS media_mime
     FROM post_analytics pa
     JOIN post_targets pt ON pa.post_target_id = pt.id
     JOIN posts p         ON pt.post_id = p.id
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     LEFT JOIN media m ON m.id = (
       SELECT pm.media_id FROM post_media pm
       WHERE pm.post_id = p.id
       ORDER BY pm.sort_order ASC, pm.media_id ASC
       LIMIT 1
     )
     WHERE p.published_at BETWEEN ? AND ?
       ${accountsFilter}
       AND p.post_type IN (${typePlaceholders})
     ORDER BY pa.reach DESC
     LIMIT 12`,
    params
  );

  return {
    range: { start, end },
    rows: rows.map(r => {
      const isVideo = (r.media_mime || '').startsWith('video/');
      const path = isVideo ? (r.media_thumb_path || null) : (r.media_file_path || null);
      return {
        postId: r.post_id,
        content: r.content,
        postType: r.post_type,
        publishedAt: r.published_at,
        platform: r.platform,
        accountName: r.account_name,
        thumbnailUrl: path ? storage.publicUrlFor(path) : null,
        mediaMime: r.media_mime || null,
        views: Number(r.impressions) || 0,
        reach: Number(r.reach) || 0,
        likes: Number(r.likes) || 0,
        comments: Number(r.comments) || 0,
        shares: Number(r.shares) || 0,
        saves: Number(r.saves) || 0,
        engagementRate: parseFloat(r.engagement_rate) || 0,
      };
    }),
  };
}

// Fans by demographic dimension (country or gender_age). Reads the
// latest snapshot per (account, dimension_key) within or before the
// end of range, sums fans across all in-scope accounts, returns rows
// sorted descending.
async function buildFansByDimension(dashboard, widget, dimension) {
  const { end } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);
  const endDay = end.slice(0, 10);
  const accountsFilter = channelIds && channelIds.length > 0
    ? `AND social_account_id IN (${channelIds.map(() => '?').join(',')})`
    : '';
  try {
    const [rows] = await pool.execute(
      `SELECT dimension_key, SUM(latest.fans_count) AS v
       FROM (
         SELECT cd.social_account_id, cd.dimension_key, cd.fans_count
         FROM channel_demographics cd
         JOIN (
           SELECT social_account_id, dimension_key, MAX(snapshot_date) AS d
           FROM channel_demographics
           WHERE dimension = ? AND snapshot_date <= ?
           GROUP BY social_account_id, dimension_key
         ) lx ON lx.social_account_id = cd.social_account_id
              AND lx.dimension_key = cd.dimension_key
              AND lx.d = cd.snapshot_date
         WHERE cd.dimension = ? ${accountsFilter}
       ) latest
       GROUP BY dimension_key
       ORDER BY v DESC`,
      [dimension, endDay, dimension, ...(channelIds || [])]
    );
    const total = rows.reduce((s, r) => s + (Number(r.v) || 0), 0);
    return {
      range: { end },
      total,
      rows: rows.map(r => ({
        key:   r.dimension_key,
        value: Number(r.v) || 0,
        share: total > 0 ? (Number(r.v) / total) * 100 : 0,
      })),
    };
  } catch {
    return { range: { end }, total: 0, rows: [] };
  }
}

// Follow vs Non-follow view split — single-call summary from
// channel_insights_daily.follower_views / non_follower_views. Rendered
// as a horizontal bar chart on the IG/FB templates.
async function buildFollowNonFollowSplit(dashboard, widget) {
  const { start, end, priorStart, priorEnd } = resolveRange(dashboard);
  const channelIds = resolveChannelIds(dashboard, widget);
  const [follower, nonFollower, followerPrior, nonFollowerPrior] = await Promise.all([
    totalForMetric('follower_views',     channelIds, start, end),
    totalForMetric('non_follower_views', channelIds, start, end),
    totalForMetric('follower_views',     channelIds, priorStart, priorEnd),
    totalForMetric('non_follower_views', channelIds, priorStart, priorEnd),
  ]);
  return {
    range: { start, end, priorStart, priorEnd },
    rows: [
      { key: 'follower',     label: 'Follower',     current: follower,    prior: followerPrior },
      { key: 'non_follower', label: 'Non-follower', current: nonFollower, prior: nonFollowerPrior },
    ],
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

  // Join the post's first media (by sort_order) so the client can show its
  // thumbnail. Correlated subquery instead of a window function so this
  // works on MySQL 5.7 as well as 8.x.
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
            m.file_path       AS media_file_path,
            m.thumbnail_path  AS media_thumb_path,
            m.mime_type       AS media_mime,
            ${sortCol} AS sort_val
     FROM post_analytics pa
     JOIN post_targets pt ON pa.post_target_id = pt.id
     JOIN posts p         ON pt.post_id = p.id
     JOIN social_accounts sa ON pt.social_account_id = sa.id
     LEFT JOIN media m ON m.id = (
       SELECT pm.media_id FROM post_media pm
       WHERE pm.post_id = p.id
       ORDER BY pm.sort_order ASC, pm.media_id ASC
       LIMIT 1
     )
     WHERE p.published_at BETWEEN ? AND ?
       ${accountsFilter}
     ORDER BY sort_val DESC
     LIMIT 10`,
    params
  );

  return {
    range: { start, end },
    sortBy: { key: sortKey, label: m?.label || sortKey, format: m?.format },
    rows: rows.map(r => {
      // For videos prefer the generated thumbnail; for images use the
      // file itself. Fall back to null when there's no media attached so
      // the client falls back to the platform icon.
      const isVideo = (r.media_mime || '').startsWith('video/');
      const path = isVideo
        ? (r.media_thumb_path || null)
        : (r.media_file_path  || null);
      const thumbnailUrl = path ? storage.publicUrlFor(path) : null;
      return {
        postId: r.post_id,
        content: r.content,
        publishedAt: r.published_at,
        platform: r.platform,
        accountName: r.account_name,
        thumbnailUrl,
        mediaMime: r.media_mime || null,
        impressions: Number(r.impressions) || 0,
        reach: Number(r.reach) || 0,
        likes: Number(r.likes) || 0,
        comments: Number(r.comments) || 0,
        shares: Number(r.shares) || 0,
        saves: Number(r.saves) || 0,
        engagementRate: parseFloat(r.engagement_rate) || 0,
        sortValue: Number(r.sort_val) || 0,
      };
    }),
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
            SUM(CASE WHEN sentiment = 'negative' THEN 1 ELSE 0 END) AS negative,
            SUM(CASE WHEN sentiment IS NULL      THEN 1 ELSE 0 END) AS uncategorized
     FROM engage_messages
     WHERE direction = 'incoming' AND sent_at BETWEEN ? AND ?
     GROUP BY DATE(sent_at) ORDER BY date ASC`,
    [start, end]
  );
  return {
    range: { start, end },
    points: rows.map(r => ({
      date: r.date,
      positive:      Number(r.positive) || 0,
      neutral:       Number(r.neutral) || 0,
      negative:      Number(r.negative) || 0,
      uncategorized: Number(r.uncategorized) || 0,
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
    case 'reaction_breakdown':
    case 'demographics':
    case 'geographics':
    case 'metric_by_post_type':            return buildMetricByPostType(dashboard, widget);
    case 'metric_by_post_type_over_time':  return buildMetricByPostTypeOverTime(dashboard, widget);
    case 'top_err_profiles':               return buildTopErrProfiles(dashboard, widget);
    case 'engagements_by_profile':         return buildEngagementsByProfile(dashboard, widget);
    case 'follow_non_follow_split':        return buildFollowNonFollowSplit(dashboard, widget);
    case 'followers_by_country':           return buildFansByDimension(dashboard, widget, 'country');
    case 'fans_by_age_gender':             return buildFansByDimension(dashboard, widget, 'gender_age');
    case 'reels_performance':              return buildPostTypePerformance(dashboard, widget, ['reel','video']);
    case 'story_performance':              return buildPostTypePerformance(dashboard, widget, ['story']);
    case 'views_from_source':              return { placeholder: true };
    case 'fans_online_hourly':             return { placeholder: true };
    case 'engage_volume_by_network':
    case 'engage_sentiment_by_network':
    case 'engage_sentiment_by_channel':
    case 'engage_sentiment_by_label':
    case 'engage_sentiment_kpi_group':
    case 'net_new_subscribers_by_country':
    case 'shares_by_source':
    case 'engagements_by_country':
    case 'top_sources_by_views':
    case 'video_views_by_country':
    case 'watch_time_by_country':
    case 'longform_videos_performance':
    case 'shorts_performance':
    case 'video_performance':
    case 'fans_by_function':
    case 'fans_by_seniority':
    case 'fans_by_association':
    case 'reach_by_follower_type':
    case 'reach_by_distribution':
    case 'metric_organic_paid_split':      return { placeholder: true };
    default:                      return { unsupported: widget.widget_type || widget.widgetType };
  }
}

module.exports = { buildWidgetData, resolveRange };
