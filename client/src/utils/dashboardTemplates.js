// The starter templates shown in the "Select dashboard template" picker.
// `widgets` is a seed array we POST when the user creates from a template;
// each entry is { category, widgetType, title, metricKeys?, config?, width?, height? }.
// Only widgetType + category are required; the user fills the rest in the builder.
// `platforms` controls the social-icon row under the card preview.
// `available` lets us grey out templates that need data we don't yet collect.

export const DASHBOARD_TEMPLATES = [
  {
    key: 'facebook_overview',
    name: 'Facebook overview',
    platforms: ['facebook_page'],
    available: true,
    description: 'Reactions, reach, engagement and top content on your Facebook Pages.',
    widgets: [
      // Headline KPIs
      { category: 'channel', widgetType: 'key_metrics', title: 'Page key metrics',
        metricKeys: ['impressions','reach','likes','comments','shares','engagement_rate','posts'],
        width: 12, height: 2 },
      // Channel comparison — when multiple pages are selected, shows per-account split
      { category: 'channel', widgetType: 'channel_comparison', title: 'Performance by channel',
        metricKeys: ['impressions'], width: 12, height: 3 },
      // Time series — impressions vs reach
      { category: 'channel', widgetType: 'time_series', title: 'Impressions & Reach',
        metricKeys: ['impressions','reach'], width: 6, height: 3 },
      // Time series — engagements
      { category: 'channel', widgetType: 'time_series', title: 'Engagements over time',
        metricKeys: ['likes','comments','shares'], width: 6, height: 3 },
      // Time series — clicks
      { category: 'channel', widgetType: 'time_series', title: 'Daily clicks',
        metricKeys: ['clicks'], width: 6, height: 3 },
      // Top posts table
      { category: 'content', widgetType: 'content_performance', title: 'Top performing posts',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
    ],
  },
  {
    key: 'instagram_overview',
    name: 'Instagram overview',
    platforms: ['instagram_business'],
    available: true,
    description: 'Reach, saves and engagement rate across your IG accounts.',
    widgets: [
      { category: 'channel', widgetType: 'key_metrics', title: 'Account key metrics',
        metricKeys: ['reach','impressions','likes','comments','saves','engagement_rate','posts'],
        width: 12, height: 2 },
      { category: 'channel', widgetType: 'channel_comparison', title: 'Performance by channel',
        metricKeys: ['reach'], width: 12, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Reach & impressions',
        metricKeys: ['reach','impressions'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Likes, comments, saves',
        metricKeys: ['likes','comments','saves'], width: 6, height: 3 },
      { category: 'content', widgetType: 'content_performance', title: 'Top performing posts',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
    ],
  },
  {
    key: 'tiktok_overview',
    name: 'TikTok overview',
    platforms: ['tiktok'],
    available: true,
    badge: 'Updated',
    description: 'Impressions, likes, shares — both organic and ads.',
    widgets: [
      { category: 'channel', widgetType: 'key_metrics', title: 'TikTok key metrics',
        metricKeys: ['impressions','reach','likes','comments','shares','engagement_rate','posts'],
        width: 12, height: 2 },
      { category: 'channel', widgetType: 'channel_comparison', title: 'Performance by channel',
        metricKeys: ['impressions'], width: 12, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Impressions over time',
        metricKeys: ['impressions'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Engagements',
        metricKeys: ['likes','comments','shares'], width: 6, height: 3 },
      { category: 'content', widgetType: 'content_performance', title: 'Top performing videos',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
    ],
  },
  {
    key: 'paid_performance',
    name: 'Paid performance',
    platforms: ['meta_ads','google_ads','tiktok_ads'],
    available: true,
    requiresAdAccount: true,
    description: 'Spend, CTR, CPC, conversions and ROAS across Meta, Google and TikTok ads.',
    widgets: [
      { category: 'channel', widgetType: 'key_metrics', title: 'Spend & efficiency', metricKeys: ['spend','impressions','clicks','ctr','cpc','roas','conversions'], width: 12, height: 2 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily spend', metricKeys: ['spend'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Clicks & impressions', metricKeys: ['clicks','impressions'], width: 6, height: 3 },
    ],
  },
  {
    key: 'content_performance',
    name: 'Content performance',
    platforms: ['facebook_page','instagram_business','tiktok'],
    available: true,
    description: 'Which posts performed best in the period. Sort by impressions, engagement or saves.',
    widgets: [
      { category: 'content', widgetType: 'key_metrics', title: 'Content key metrics', metricKeys: ['impressions','reach','engagement_rate','likes'], width: 12, height: 2 },
      { category: 'content', widgetType: 'content_performance', title: 'Top posts', width: 12, height: 4 },
    ],
  },
  {
    key: 'customer_engagement',
    name: 'Customer engagement',
    platforms: ['facebook_page','instagram_business','tiktok'],
    available: true,
    badge: 'Updated',
    description: 'Incoming comments and DMs, replies, and audience sentiment.',
    widgets: [
      { category: 'engage', widgetType: 'key_metrics', title: 'Inbox volume', metricKeys: ['incoming_messages','outgoing_replies','negative_sentiment_rate'], width: 12, height: 2 },
      { category: 'engage', widgetType: 'time_series', title: 'Incoming volume over time', metricKeys: ['incoming_messages','outgoing_replies'], width: 7, height: 3 },
      { category: 'engage', widgetType: 'sentiment_breakdown', title: 'Sentiment split', width: 5, height: 3 },
      { category: 'engage', widgetType: 'sentiment_trend', title: 'Sentiment over time', width: 12, height: 3 },
    ],
  },
  {
    key: 'fans_overview',
    name: 'Fans overview',
    platforms: ['facebook_page','instagram_business','tiktok'],
    available: false,
    description: 'Follower growth, demographics and geographics across your accounts. Requires demographic insights (coming soon).',
    widgets: [],
  },
  {
    key: 'distribution_overview',
    name: 'Distribution overview',
    platforms: ['facebook_page','instagram_business'],
    available: false,
    description: 'How content was distributed — organic vs paid, by post type. Requires distribution breakdown (coming soon).',
    widgets: [],
  },
  {
    key: 'video_overview',
    name: 'Video overview',
    platforms: ['facebook_page'],
    available: false,
    description: 'Video views, watch time, retention. Requires video metrics collection (coming soon).',
    widgets: [],
  },
  {
    key: 'instagram_stories_dms',
    name: 'Instagram stories & DMs',
    platforms: ['instagram_business'],
    available: false,
    description: 'Story performance and DM volume. Requires story insights ingestion (coming soon).',
    widgets: [],
  },
  {
    key: 'label_performance',
    name: 'Label performance',
    platforms: ['facebook_page','instagram_business','tiktok'],
    available: false,
    description: 'Compare performance by post label/tag. Requires label system (coming soon).',
    widgets: [],
  },
  {
    key: 'linkedin_overview',
    name: 'LinkedIn overview',
    platforms: ['linkedin'],
    available: false,
    description: 'Followers, impressions, engagement on LinkedIn Pages. LinkedIn integration coming soon.',
    widgets: [],
  },
  {
    key: 'twitter_overview',
    name: 'Twitter / X overview',
    platforms: ['twitter'],
    available: false,
    description: 'Impressions, engagements and follower growth. X integration coming soon.',
    widgets: [],
  },
  {
    key: 'youtube_overview',
    name: 'YouTube overview',
    platforms: ['youtube'],
    available: false,
    description: 'Views, watch time, subscribers. YouTube integration coming soon.',
    widgets: [],
  },
  {
    key: 'pinterest_overview',
    name: 'Pinterest overview',
    platforms: ['pinterest'],
    available: false,
    description: 'Saves, outbound clicks, impressions. Pinterest integration coming soon.',
    widgets: [],
  },
  {
    key: 'custom',
    name: 'Build your own',
    platforms: ['facebook_page','instagram_business','tiktok'],
    available: true,
    description: 'Start with an empty canvas and add the widgets you want.',
    widgets: [],
  },
];

export function getTemplate(key) {
  return DASHBOARD_TEMPLATES.find(t => t.key === key) || null;
}
