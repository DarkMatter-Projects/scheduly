// Single source of truth for which metrics a dashboard widget can use.
// `source` drives the data resolver below — keep these in sync.
// `available: false` means the schema doesn't collect the data yet and the
// picker should show it disabled rather than hiding it.
//
// `description` powers the cell hover-tooltip on dashboard widgets.
// `scope` is the badge text in the tooltip footer:
//    - 'channel' = activity on the connected account itself (followers, etc.)
//    - 'content' = activity on posts published during the date range
//    - 'engage'  = inbox / comment-thread activity

const METRICS = [
  // ── Followers (sourced from follower_history daily snapshots; ingestion
  //    job seeds the table — until the first snapshot lands these return 0) ──
  { key: 'followers',           label: 'Followers',           section: 'followers',   category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'follower_history.latest', available: true,
    scope: 'channel',
    description: 'The total number of people who have followed or subscribed to your channel(s).' },
  { key: 'net_new_followers',   label: 'Net new followers',   section: 'followers',   category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'follower_history.delta',  available: true,
    scope: 'channel',
    description: 'This metric counts the daily net fluctuations of your followers (Facebook, Instagram, TikTok, YouTube). Instagram requires at least 100 followers to be available.' },

  // ── Distribution / reach ──
  { key: 'impressions',         label: 'Impressions',         section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.impressions',    available: true,
    scope: 'content',
    description: 'The number of times your content was played or displayed. Includes reels, posts, stories and ads.' },
  { key: 'views',               label: 'Views',               section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.impressions',    available: true,
    scope: 'content',
    description: 'The number of times your content was played or displayed. Includes reels, posts, stories and ads.' },
  { key: 'reach',               label: 'Reach',               section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.reach',          available: true,
    scope: 'content',
    description: 'The total number of unique people who saw any post from your channel during the period.' },
  { key: 'reach_daily_avg',     label: 'Reach (daily) avg.',  section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'derived.reach_daily_avg',       available: true,
    scope: 'channel',
    description: 'The daily number of people who had a post from your channel enter their feed. Use the daily visualisation or average to get accurate metrics.' },

  // ── Engagements ──
  { key: 'likes',               label: 'Likes',               section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.likes',          available: true,
    scope: 'content',
    description: 'The total number of likes (or reactions on Facebook) on posts during the period.' },
  { key: 'comments',            label: 'Comments',            section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.comments_count', available: true,
    scope: 'content',
    description: 'The total number of comments left on posts during the period.' },
  { key: 'shares',              label: 'Shares',              section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.shares',         available: true,
    scope: 'content',
    description: 'The number of times your posts were shared during the period.' },
  { key: 'saves',               label: 'Saves',               section: 'engagements', category: 'channel', platforms: ['instagram_business'],                          format: 'number',   source: 'post_analytics.saves',          available: true,
    scope: 'content',
    description: 'The number of times Instagram users saved your posts during the period.' },
  { key: 'clicks',              label: 'Clicks',              section: 'engagements', category: 'channel', platforms: ['facebook_page'],                               format: 'number',   source: 'post_analytics.clicks',         available: true,
    scope: 'content',
    description: 'The total number of clicks on links, photos and other content within your posts.' },
  { key: 'engagement_rate',     label: 'Engagement rate',     section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'percent',  source: 'derived.engagement_rate',       available: true,
    scope: 'content',
    description: 'Engagements divided by impressions, averaged across posts published in the period.' },
  { key: 'interactions',        label: 'Interactions',        section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'derived.interactions',          available: true,
    scope: 'content',
    description: 'The number of Reactions, Comments, Shares, Saves (IG), Reposts (IG) and Clicks (FB and LI) on your posts during the period.' },
  { key: 'posts',               label: 'Posts published',     section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'posts.count',                    available: true,
    scope: 'content',
    description: 'The number of posts published from Scheduly during the period.' },

  // ── Paid (ad insights) ──
  { key: 'spend',               label: 'Ad spend',            section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'currency', source: 'ad_insights.spend',             available: true,
    scope: 'channel',
    description: 'Total amount spent on ad campaigns during the period.' },
  { key: 'ad_impressions',      label: 'Ad impressions',      section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'number',   source: 'ad_insights.impressions',       available: true,
    scope: 'channel',
    description: 'The number of times your ads were displayed during the period.' },
  { key: 'ad_clicks',           label: 'Ad clicks',           section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'number',   source: 'ad_insights.clicks',            available: true,
    scope: 'channel',
    description: 'The number of clicks on your ads during the period.' },
  { key: 'ctr',                 label: 'CTR',                 section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'percent',  source: 'derived.ctr',                   available: true,
    scope: 'channel',
    description: 'Click-through rate — clicks divided by impressions.' },
  { key: 'cpc',                 label: 'CPC',                 section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'currency', source: 'derived.cpc',                   available: true, invertDelta: true,
    scope: 'channel',
    description: 'Cost per click — spend divided by clicks. Lower is better.' },
  { key: 'cpm',                 label: 'CPM',                 section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'currency', source: 'derived.cpm',                   available: true, invertDelta: true,
    scope: 'channel',
    description: 'Cost per 1,000 impressions. Lower is better.' },
  { key: 'conversions',         label: 'Conversions',         section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'number',   source: 'ad_insights.conversions',       available: true,
    scope: 'channel',
    description: 'The number of conversion events attributed to your ads during the period.' },
  { key: 'roas',                label: 'ROAS',                section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'multiplier', source: 'derived.roas',                available: true,
    scope: 'channel',
    description: 'Return on ad spend — conversion value divided by spend.' },

  // ── Engage metrics (depend on engage_messages once ingestion ships) ──
  { key: 'incoming_messages',   label: 'Incoming messages',   section: 'engage',       category: 'engage',  platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'engage_messages.incoming',      available: true,
    scope: 'engage',
    description: 'The number of comments and DMs received in the Engage inbox during the period.' },
  { key: 'outgoing_replies',    label: 'Replies sent',        section: 'engage',       category: 'engage',  platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'engage_messages.outgoing',      available: true,
    scope: 'engage',
    description: 'The number of replies sent from the Engage inbox during the period.' },
  { key: 'negative_sentiment_rate', label: 'Negative sentiment rate', section: 'engage', category: 'engage', platforms: ['facebook_page','instagram_business','tiktok'], format: 'percent',  source: 'derived.engage_negative_rate',  available: true,
    scope: 'engage',
    description: 'The percentage of incoming messages classified as negative by the sentiment analyser.' },
];

const METRICS_BY_KEY = Object.fromEntries(METRICS.map(m => [m.key, m]));

function metric(key) {
  return METRICS_BY_KEY[key] || null;
}

// Helper used by the resolver: which storage table a metric lives in, so we
// can dispatch the SQL once per group instead of per metric.
function metricFamily(key) {
  const m = METRICS_BY_KEY[key];
  if (!m) return null;
  if (m.source.startsWith('post_analytics.')) return 'organic';
  if (m.source.startsWith('posts.')) return 'organic';
  if (m.source === 'derived.engagement_rate') return 'organic';
  if (m.source === 'derived.interactions') return 'organic';
  if (m.source === 'derived.reach_daily_avg') return 'organic';
  if (m.source.startsWith('follower_history.')) return 'followers';
  if (m.source.startsWith('ad_insights.')) return 'paid';
  if (m.source.startsWith('derived.') && ['ctr','cpc','cpm','roas'].includes(key)) return 'paid';
  if (m.source.startsWith('engage_messages.')) return 'engage';
  if (m.source === 'derived.engage_negative_rate') return 'engage';
  return null;
}

module.exports = { METRICS, METRICS_BY_KEY, metric, metricFamily };
