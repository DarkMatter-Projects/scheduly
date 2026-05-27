// Single source of truth for which metrics a dashboard widget can use.
// `source` drives the data resolver below — keep these in sync.
// `available: false` means the schema doesn't collect the data yet and the
// picker should show it disabled rather than hiding it.

const METRICS = [
  // ── Followers (mostly placeholder until we add account-level history) ──
  { key: 'followers',           label: 'Followers',           section: 'followers',   category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'unavailable', available: false },
  { key: 'net_new_followers',   label: 'Net new followers',   section: 'followers',   category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'unavailable', available: false },

  // ── Distribution / reach ──
  { key: 'impressions',         label: 'Impressions',         section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.impressions',    available: true },
  { key: 'reach',               label: 'Reach',               section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.reach',          available: true },

  // ── Engagements ──
  { key: 'likes',               label: 'Likes',               section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.likes',          available: true },
  { key: 'comments',            label: 'Comments',            section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.comments_count', available: true },
  { key: 'shares',              label: 'Shares',              section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.shares',         available: true },
  { key: 'saves',               label: 'Saves',               section: 'engagements', category: 'channel', platforms: ['instagram_business'],                          format: 'number',   source: 'post_analytics.saves',          available: true },
  { key: 'clicks',              label: 'Clicks',              section: 'engagements', category: 'channel', platforms: ['facebook_page'],                               format: 'number',   source: 'post_analytics.clicks',         available: true },
  { key: 'engagement_rate',     label: 'Engagement rate',     section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'percent',  source: 'derived.engagement_rate',       available: true },
  { key: 'interactions',        label: 'Interactions',        section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'derived.interactions',          available: true },
  { key: 'posts',               label: 'Posts published',     section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'posts.count',                    available: true },

  // ── Paid (ad insights) ──
  { key: 'spend',               label: 'Ad spend',            section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'currency', source: 'ad_insights.spend',             available: true },
  { key: 'ad_impressions',      label: 'Ad impressions',      section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'number',   source: 'ad_insights.impressions',       available: true },
  { key: 'ad_clicks',           label: 'Ad clicks',           section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'number',   source: 'ad_insights.clicks',            available: true },
  { key: 'ctr',                 label: 'CTR',                 section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'percent',  source: 'derived.ctr',                   available: true },
  { key: 'cpc',                 label: 'CPC',                 section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'currency', source: 'derived.cpc',                   available: true, invertDelta: true },
  { key: 'cpm',                 label: 'CPM',                 section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'currency', source: 'derived.cpm',                   available: true, invertDelta: true },
  { key: 'conversions',         label: 'Conversions',         section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'number',   source: 'ad_insights.conversions',       available: true },
  { key: 'roas',                label: 'ROAS',                section: 'paid',         category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'multiplier', source: 'derived.roas',                available: true },

  // ── Engage metrics (depend on engage_messages once ingestion ships) ──
  { key: 'incoming_messages',   label: 'Incoming messages',   section: 'engage',       category: 'engage',  platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'engage_messages.incoming',      available: true },
  { key: 'outgoing_replies',    label: 'Replies sent',        section: 'engage',       category: 'engage',  platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'engage_messages.outgoing',      available: true },
  { key: 'negative_sentiment_rate', label: 'Negative sentiment rate', section: 'engage', category: 'engage', platforms: ['facebook_page','instagram_business','tiktok'], format: 'percent',  source: 'derived.engage_negative_rate',  available: true },
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
  if (m.source.startsWith('ad_insights.')) return 'paid';
  if (m.source.startsWith('derived.') && ['ctr','cpc','cpm','roas'].includes(key)) return 'paid';
  if (m.source.startsWith('engage_messages.')) return 'engage';
  if (m.source === 'derived.engage_negative_rate') return 'engage';
  return null;
}

module.exports = { METRICS, METRICS_BY_KEY, metric, metricFamily };
