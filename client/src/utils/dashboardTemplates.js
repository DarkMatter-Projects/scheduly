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
      // 1. Per-channel summary table
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Performance by channel',
        metricKeys: ['followers','net_new_followers','views','reach_daily_avg','interactions'],
        width: 12, height: 3 },
      // 2. Full-width follower trend
      { category: 'channel', widgetType: 'time_series', title: 'Daily followers',
        metricKeys: ['followers'], width: 12, height: 3 },
      // 3. Views + Daily views
      { category: 'channel', widgetType: 'key_metrics', title: 'Views',
        metricKeys: ['views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily views',
        metricKeys: ['views'], width: 8, height: 3 },
      // 4. Organic vs Paid views
      { category: 'channel', widgetType: 'key_metrics', title: 'Organic vs Paid views',
        metricKeys: ['organic_views','paid_views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily Organic vs Paid views',
        metricKeys: ['organic_views','paid_views'], width: 8, height: 3 },
      // 5. Follower vs Non-Follower (Meta page-level breakdowns — empty
      //    until page_impressions_by_user_type ingestion ships)
      { category: 'channel', widgetType: 'key_metrics', title: 'Follower vs Non Follower',
        metricKeys: ['follower_views','non_follower_views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily Follower vs Non Follower Views',
        metricKeys: ['follower_views','non_follower_views'], width: 8, height: 3 },
      // 6. Average daily page reach (organic + paid)
      { category: 'channel', widgetType: 'key_metrics', title: 'Average daily page reach',
        metricKeys: ['reach_daily_avg','paid_reach_daily_avg'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily reach',
        metricKeys: ['reach_daily_avg','paid_reach_daily_avg'], width: 8, height: 3 },
      // 7. Viral vs Non-viral reach (empty until viral_unique ingestion)
      { category: 'channel', widgetType: 'key_metrics', title: 'Viral vs. Non-viral (daily) avg',
        metricKeys: ['non_viral_reach_daily_avg','viral_reach_daily_avg'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily non-viral and viral reach',
        metricKeys: ['non_viral_reach_daily_avg','viral_reach_daily_avg'], width: 8, height: 3 },
      // 8. Page interactions + Reactions breakdown (per-reaction-type bar
      //    chart needs post_reactions_by_type_total per post — empty for now)
      { category: 'channel', widgetType: 'key_metrics', title: 'Page interactions',
        metricKeys: ['interactions','reactions'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'reaction_breakdown', title: 'Reactions',
        width: 8, height: 3 },
      // 9. Daily interactions trend
      { category: 'channel', widgetType: 'time_series', title: 'Daily interactions',
        metricKeys: ['interactions'], width: 12, height: 3 },
      // 10. Label performance (needs label/tag system on posts)
      { category: 'content', widgetType: 'label_performance', title: 'Label performance',
        width: 12, height: 4 },
      // 11. Content performance — top posts table
      { category: 'content', widgetType: 'content_performance', title: 'Content performance',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      // 12. Paid performance table (needs ad-level per-post breakdown)
      { category: 'content', widgetType: 'paid_performance', title: 'Paid performance',
        width: 12, height: 4 },
      // 13. Video consumption (Watch time + Video viewers — empty until
      //     page_video_views_unique ingestion ships)
      { category: 'channel', widgetType: 'time_series', title: 'Video consumption',
        metricKeys: ['video_watch_time','video_viewers'], width: 12, height: 3 },
      // 14. Followers by country (needs page_fans_country ingestion)
      { category: 'channel', widgetType: 'followers_by_country', title: 'Followers by country',
        width: 12, height: 4 },
    ],
  },
  {
    key: 'instagram_overview',
    name: 'Instagram overview',
    platforms: ['instagram_business'],
    available: true,
    description: 'Reach, saves and engagement rate across your IG accounts.',
    widgets: [
      // 1. Per-channel summary table
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Performance by channel',
        metricKeys: ['followers','net_new_followers','views','reach_daily_avg','interactions'],
        width: 12, height: 3 },
      // 2. Full-width follower trend
      { category: 'channel', widgetType: 'time_series', title: 'Daily followers',
        metricKeys: ['followers'], width: 12, height: 3 },
      // 3. Engagement Rate Reach (KPI) + by post type (bar chart placeholder)
      { category: 'channel', widgetType: 'key_metrics', title: 'Engagement Rate Reach',
        metricKeys: ['engagement_rate_reach'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Engagement Rate Reach by post type',
        width: 8, height: 3 },
      // 4. Top ERR Profiles + ERR by post type over time
      { category: 'channel', widgetType: 'top_err_profiles', title: 'Top ERR Profiles',
        width: 4, height: 3 },
      { category: 'channel', widgetType: 'metric_by_post_type_over_time', title: 'ERR by post type over time',
        width: 8, height: 3 },
      // 5. Average daily reach trio
      { category: 'channel', widgetType: 'key_metrics', title: 'Avg. Daily Reach',
        metricKeys: ['reach_daily_avg'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'follow_non_follow_split', title: 'Follow/Non follow',
        width: 4, height: 3 },
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Avg. Daily Reach by post type',
        width: 4, height: 3 },
      // 6. Reach by post type over time + Top published posts by Reach
      { category: 'channel', widgetType: 'metric_by_post_type_over_time', title: 'Reach by post type over time',
        width: 8, height: 4 },
      { category: 'content', widgetType: 'content_performance', title: 'Top published posts by Reach',
        metricKeys: ['reach'], width: 4, height: 4 },
      // 7. Engaged users + over time
      { category: 'channel', widgetType: 'key_metrics', title: 'Engaged users',
        metricKeys: ['engaged_users_daily_avg','engaged_users_rate'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Engaged users over time',
        metricKeys: ['engaged_users_daily_avg'], width: 8, height: 3 },
      // 8. Engagements + by post type
      { category: 'channel', widgetType: 'key_metrics', title: 'Engagements',
        metricKeys: ['interactions'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Engagements by post type',
        width: 8, height: 3 },
      // 9. Engagements by post type over time (full width)
      { category: 'channel', widgetType: 'metric_by_post_type_over_time', title: 'Engagements by post type over time',
        width: 12, height: 4 },
      // 10. Engagements breakdown KPI + breakdown over time
      { category: 'channel', widgetType: 'key_metrics', title: 'Engagements breakdown',
        metricKeys: ['likes','comments','shares','saves','reposts'], width: 4, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Engagements breakdown over time',
        metricKeys: ['likes','comments','shares','saves','reposts'], width: 8, height: 4 },
      // 11. Comments by post type + Shares by post type
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Comments by post type',
        width: 6, height: 3 },
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Shares by post type',
        width: 6, height: 3 },
      // 12. Profile views + over time + Profile taps
      { category: 'channel', widgetType: 'key_metrics', title: 'Profile views',
        metricKeys: ['channel_profile_views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Profile views overtime',
        metricKeys: ['channel_profile_views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'key_metrics', title: 'Profile taps',
        metricKeys: ['profile_taps'], width: 4, height: 3 },
      // 13. Reels performance + Story performance
      { category: 'content', widgetType: 'reels_performance', title: 'Reels performance',
        width: 12, height: 5 },
      { category: 'content', widgetType: 'story_performance', title: 'Story performance',
        width: 12, height: 5 },
      // 14. Fans by age and gender + Fans by country
      { category: 'channel', widgetType: 'fans_by_age_gender', title: 'Fans by age and gender',
        width: 12, height: 4 },
      { category: 'channel', widgetType: 'followers_by_country', title: 'Fans by country',
        width: 12, height: 5 },
      // 15. Engagements by Profile (per-channel breakdown)
      { category: 'channel', widgetType: 'engagements_by_profile', title: 'Engagements by Profile',
        width: 12, height: 3 },
      // Existing IG widgets (kept at the bottom)
      { category: 'channel', widgetType: 'key_metrics', title: 'Account key metrics',
        metricKeys: ['reach','impressions','likes','comments','saves','engagement_rate','posts'],
        width: 12, height: 2 },
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
