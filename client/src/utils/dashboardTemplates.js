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
        metricKeys: ['engagement_rate_reach'], width: 8, height: 3 },
      // 4. Top ERR Profiles + ERR by post type over time
      { category: 'channel', widgetType: 'top_err_profiles', title: 'Top ERR Profiles',
        width: 4, height: 3 },
      { category: 'channel', widgetType: 'metric_by_post_type_over_time', title: 'ERR by post type over time',
        metricKeys: ['engagement_rate_reach'], width: 8, height: 3 },
      // 5. Average daily reach trio
      { category: 'channel', widgetType: 'key_metrics', title: 'Avg. Daily Reach',
        metricKeys: ['reach_daily_avg'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'follow_non_follow_split', title: 'Follow/Non follow',
        width: 4, height: 3 },
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Avg. Daily Reach by post type',
        metricKeys: ['reach_daily_avg'], width: 4, height: 3 },
      // 6. Reach by post type over time + Top published posts by Reach
      { category: 'channel', widgetType: 'metric_by_post_type_over_time', title: 'Reach by post type over time',
        metricKeys: ['reach'], width: 8, height: 4 },
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
        metricKeys: ['interactions'], width: 8, height: 3 },
      // 9. Engagements by post type over time (full width)
      { category: 'channel', widgetType: 'metric_by_post_type_over_time', title: 'Engagements by post type over time',
        metricKeys: ['interactions'], width: 12, height: 4 },
      // 10. Engagements breakdown KPI + breakdown over time
      { category: 'channel', widgetType: 'key_metrics', title: 'Engagements breakdown',
        metricKeys: ['likes','comments','shares','saves','reposts'], width: 4, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Engagements breakdown over time',
        metricKeys: ['likes','comments','shares','saves','reposts'], width: 8, height: 4 },
      // 11. Comments by post type + Shares by post type
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Comments by post type',
        metricKeys: ['comments'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Shares by post type',
        metricKeys: ['shares'], width: 6, height: 3 },
      // 12. Profile views + over time + Profile taps
      { category: 'channel', widgetType: 'key_metrics', title: 'Profile views',
        metricKeys: ['channel_profile_views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Profile views overtime',
        metricKeys: ['channel_profile_views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'key_metrics', title: 'Profile taps',
        metricKeys: ['profile_taps'], width: 4, height: 3 },
      // 13. Label performance -> Content performance -> Reels -> Story -> Fans
      { category: 'content', widgetType: 'label_performance', title: 'Label performance',
        width: 12, height: 4 },
      { category: 'content', widgetType: 'content_performance', title: 'Content performance',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      { category: 'content', widgetType: 'reels_performance', title: 'Reels performance',
        width: 12, height: 5 },
      { category: 'content', widgetType: 'story_performance', title: 'Story performance',
        width: 12, height: 5 },
      { category: 'channel', widgetType: 'fans_by_age_gender', title: 'Fans by age and gender',
        width: 12, height: 4 },
      // Existing IG widgets (kept above the per-channel breakdown)
      { category: 'channel', widgetType: 'key_metrics', title: 'Account key metrics',
        metricKeys: ['reach','impressions','likes','comments','saves','engagement_rate','posts'],
        width: 12, height: 2 },
      { category: 'channel', widgetType: 'time_series', title: 'Reach & impressions',
        metricKeys: ['reach','impressions'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Likes, comments, saves',
        metricKeys: ['likes','comments','saves'], width: 6, height: 3 },
      { category: 'content', widgetType: 'content_performance', title: 'Top performing posts',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      // Fans by country — second-last
      { category: 'channel', widgetType: 'followers_by_country', title: 'Fans by country',
        width: 12, height: 5 },
      // Per-channel breakdown — sits at the very bottom of the dashboard
      { category: 'channel', widgetType: 'engagements_by_profile', title: 'Engagements by Profile',
        width: 12, height: 3 },
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
      // Per-channel summary table — mirrors the Facebook & Instagram templates
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Performance by channel',
        metricKeys: ['followers','net_new_followers','views','reach_daily_avg','interactions'],
        width: 12, height: 3 },
      // Fans KPI (stacked Followers + Net new followers) + Daily fans chart
      { category: 'channel', widgetType: 'key_metrics', title: 'Fans',
        metricKeys: ['followers','net_new_followers'], width: 4, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily fans',
        metricKeys: ['followers'], width: 8, height: 4 },
      // Video views KPI + daily trend (every TikTok post is a video, so
      // `views` IS video views).
      { category: 'channel', widgetType: 'key_metrics', title: 'Video views',
        metricKeys: ['views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily video views',
        metricKeys: ['views'], width: 8, height: 3 },
      // Average Daily Reach KPI + Reach over time
      { category: 'channel', widgetType: 'key_metrics', title: 'Average Daily Reach',
        metricKeys: ['reach_daily_avg'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Reach over time',
        metricKeys: ['reach_daily_avg'], width: 8, height: 3 },
      // Label performance (placeholder until label/tag system ships)
      { category: 'content', widgetType: 'label_performance', title: 'Label performance',
        width: 12, height: 4 },
      // Content performance + Organic performance (organic === post_analytics
      // data, which is everything we collect today since paid breakdowns
      // need ad_insights post-level join we haven't built yet).
      { category: 'content', widgetType: 'content_performance', title: 'Content performance',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      { category: 'content', widgetType: 'content_performance', title: 'Organic performance',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      // Paid performance (placeholder — needs ad post-level join)
      { category: 'content', widgetType: 'paid_performance', title: 'Paid performance',
        width: 12, height: 4 },
      // Views from source (For You / Following / Profile / Sound / Hashtag /
      // Discovery breakdown — placeholder until TikTok Display Insights
      // ingestion adds video_views_by_source)
      { category: 'content', widgetType: 'views_from_source', title: 'Views from source',
        width: 12, height: 3 },
      // Most engaging — content_performance sorted by engagement_rate
      { category: 'content', widgetType: 'content_performance', title: 'Most engaging',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      // Post engagements over time (Reactions / Comments / Shares / Saves)
      { category: 'content', widgetType: 'time_series', title: 'Post engagements over time',
        metricKeys: ['reactions','comments','shares','saves'], width: 12, height: 3 },
      // Fans online by hour of day (placeholder — needs follower_online ingestion)
      { category: 'channel', widgetType: 'fans_online_hourly', title: 'Fans online (UTC)',
        width: 12, height: 4 },
      // Fans gender breakdown + Profile views trend
      { category: 'channel', widgetType: 'fans_by_age_gender', title: 'Fans gender',
        width: 6, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Profile views',
        metricKeys: ['channel_profile_views'], width: 6, height: 4 },
      // Fans by countries (map + list — same as followers_by_country)
      { category: 'channel', widgetType: 'followers_by_country', title: 'Fans by countries',
        width: 12, height: 5 },
      { category: 'channel', widgetType: 'key_metrics', title: 'TikTok key metrics',
        metricKeys: ['impressions','reach','likes','comments','shares','engagement_rate','posts'],
        width: 12, height: 2 },
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
    platforms: ['facebook_page','instagram_business','linkedin','tiktok'],
    available: true,
    badge: 'Updated',
    description: 'Incoming comments and DMs, replies, and audience sentiment.',
    widgets: [
      // 1. Incoming volume (KPI row breaking out subtypes)
      { category: 'engage', widgetType: 'key_metrics', title: 'Incoming volume',
        metricKeys: ['incoming_messages','engage_direct_messages','engage_fan_posts','engage_mentions','engage_comments_inbox','engage_reviews'],
        width: 12, height: 3 },
      // 2. Incoming volume over time (full width)
      { category: 'engage', widgetType: 'time_series', title: 'Incoming volume over time',
        metricKeys: ['incoming_messages','outgoing_replies'], width: 12, height: 3 },
      // 3. Incoming volume by network (placeholder until per-platform engage breakdown ships)
      { category: 'engage', widgetType: 'engage_volume_by_network', title: 'Incoming volume by network',
        width: 12, height: 4 },
      // 4. Sentiment over time (full width)
      { category: 'engage', widgetType: 'sentiment_trend', title: 'Sentiment over time',
        width: 12, height: 3 },
      // 5. Incoming sentiment by network (placeholder)
      { category: 'engage', widgetType: 'engage_sentiment_by_network', title: 'Incoming sentiment by network',
        width: 12, height: 4 },
      // 6. Incoming sentiment by channel (placeholder — same shape as by network but per account)
      { category: 'engage', widgetType: 'engage_sentiment_by_channel', title: 'Incoming sentiment by channel',
        width: 12, height: 4 },
      // 7. Incoming sentiment by label (placeholder — needs label/tag system)
      { category: 'engage', widgetType: 'engage_sentiment_by_label', title: 'Incoming sentiment by label',
        width: 12, height: 4 },
      // 8-12. Per-subtype sentiment KPI groups
      { category: 'engage', widgetType: 'engage_sentiment_kpi_group', title: 'Direct messages sentiment',
        config: { subtype: 'dm',      noun: 'direct messages' }, width: 12, height: 2 },
      { category: 'engage', widgetType: 'engage_sentiment_kpi_group', title: 'Fan posts sentiment',
        config: { subtype: 'fan_post', noun: 'fan posts' }, width: 12, height: 2 },
      { category: 'engage', widgetType: 'engage_sentiment_kpi_group', title: 'Mentions sentiment',
        config: { subtype: 'mention', noun: 'mentions' }, width: 12, height: 2 },
      { category: 'engage', widgetType: 'engage_sentiment_kpi_group', title: 'Comments sentiment',
        config: { subtype: 'comment', noun: 'comments' }, width: 12, height: 2 },
      { category: 'engage', widgetType: 'engage_sentiment_kpi_group', title: 'Reviews sentiment',
        config: { subtype: 'review',  noun: 'reviews' }, width: 12, height: 2 },
      // Sentiment split donut (kept from previous template)
      { category: 'engage', widgetType: 'sentiment_breakdown', title: 'Sentiment split',
        width: 12, height: 3 },
    ],
  },
  {
    key: 'fans_overview',
    name: 'Fans overview',
    platforms: ['facebook_page','instagram_business','linkedin','twitter','tiktok','youtube'],
    available: true,
    description: 'Follower growth, demographics and geographics across every connected channel.',
    widgets: [
      // 1. Fans + Fans dynamics
      { category: 'channel', widgetType: 'key_metrics', title: 'Fans',
        metricKeys: ['followers'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'key_metrics', title: 'Fans dynamics',
        metricKeys: ['net_new_followers','followers_increase','followers_decrease'],
        width: 8, height: 3 },
      // 2. Total fans (full width)
      { category: 'channel', widgetType: 'time_series', title: 'Total fans',
        metricKeys: ['followers'], width: 12, height: 4 },
      // 3. Fans by channel (table)
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Fans by channel',
        metricKeys: ['followers','net_new_followers','followers_increase','followers_decrease'],
        width: 12, height: 3 },
      // 4. Fans online (placeholder hourly bar chart)
      { category: 'channel', widgetType: 'fans_online_hourly', title: 'Fans online avg.',
        width: 12, height: 4 },
      // 5. Fans by age and gender
      { category: 'channel', widgetType: 'fans_by_age_gender', title: 'Fans by age and gender',
        width: 12, height: 4 },
      // 6. Fans by geography (map + country list)
      { category: 'channel', widgetType: 'followers_by_country', title: 'Fans by geography',
        width: 12, height: 5 },
      // 7. Fan development (time series of gain/loss/paid/unpaid)
      { category: 'channel', widgetType: 'time_series', title: 'Fan development',
        metricKeys: ['followers_increase','followers_decrease','paid_fans_increase','unpaid_fans_increase'],
        width: 12, height: 4 },
    ],
  },
  {
    key: 'distribution_overview',
    name: 'Distribution overview',
    platforms: ['facebook_page','instagram_business','linkedin','twitter','tiktok','youtube'],
    available: true,
    description: 'How content was distributed — impressions, reach, frequency, organic vs paid, by post type and by channel.',
    widgets: [
      // 1. Distribution avg. + Viral amplification
      { category: 'channel', widgetType: 'key_metrics', title: 'Distribution avg.',
        metricKeys: ['impressions','reach_daily_avg','frequency'], width: 8, height: 3 },
      { category: 'channel', widgetType: 'key_metrics', title: 'Viral amplification',
        metricKeys: ['viral_amplification'], width: 4, height: 3 },
      // 2. Impressions (Facebook) — 4-up KPI row
      { category: 'channel', widgetType: 'key_metrics', title: 'Impressions (Facebook)',
        metricKeys: ['paid_impressions','organic_impressions','viral_impressions','non_viral_impressions'],
        width: 12, height: 3 },
      // 3. Content distribution table
      { category: 'content', widgetType: 'content_performance', title: 'Content distribution',
        metricKeys: ['impressions'], width: 12, height: 4 },
      // 4. Daily impressions and reach + Impressions breakdown (Facebook)
      { category: 'channel', widgetType: 'time_series', title: 'Daily impressions and reach',
        metricKeys: ['impressions','reach_daily'], width: 6, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Impressions breakdown (Facebook)',
        metricKeys: ['paid_impressions','viral_impressions','non_viral_impressions'],
        width: 6, height: 4 },
      // 5. Impressions by channel (table)
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Impressions by channel',
        metricKeys: ['impressions','reach_daily_avg','frequency','organic_impressions','viral_impressions'],
        width: 12, height: 3 },
      // 6. Daily profile views (full width)
      { category: 'channel', widgetType: 'time_series', title: 'Daily profile views',
        metricKeys: ['channel_profile_views'], width: 12, height: 3 },
      // 7. Reach by media type (Instagram) + Reach by follower type (Instagram)
      { category: 'channel', widgetType: 'metric_by_post_type', title: 'Reach by media type (Instagram)',
        metricKeys: ['reach'], width: 6, height: 4 },
      { category: 'channel', widgetType: 'reach_by_follower_type', title: 'Reach by follower type (Instagram)',
        width: 6, height: 4 },
      // 8. Reach by distribution (Facebook) + Paid vs Organic reach
      { category: 'channel', widgetType: 'reach_by_distribution', title: 'Reach by distribution (Facebook)',
        width: 6, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Paid vs Organic reach',
        metricKeys: ['paid_reach_daily_avg','organic_reach_daily'], width: 6, height: 4 },
    ],
  },
  {
    key: 'video_overview',
    name: 'Video overview',
    platforms: ['facebook_page','instagram_business','linkedin','tiktok','youtube'],
    available: true,
    description: 'Video views, watch time, viewers and per-channel video performance.',
    widgets: [
      // 1. Video views by time played + Video viewers and time
      { category: 'channel', widgetType: 'key_metrics', title: 'Video views by time played',
        metricKeys: ['video_views','video_views_10s'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'key_metrics', title: 'Video viewers and time',
        metricKeys: ['video_viewers','video_watch_time'], width: 6, height: 3 },
      // 2. Video views over time (full width)
      { category: 'channel', widgetType: 'time_series', title: 'Video views over time',
        metricKeys: ['video_views','video_views_10s','video_views_30s'], width: 12, height: 4 },
      // 3. Video views (3s) breakdown + Video viewers over time
      { category: 'channel', widgetType: 'metric_organic_paid_split', title: 'Video views (3s) breakdown',
        width: 6, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Video viewers over time',
        metricKeys: ['video_viewers'], width: 6, height: 4 },
      // 4. Video views by channel (table)
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Video views by channel',
        metricKeys: ['video_views','video_views_10s','video_viewers','repeated_video_views','video_watch_time'],
        width: 12, height: 3 },
      // 5. Video view time (minutes) — full width chart
      { category: 'channel', widgetType: 'time_series', title: 'Video view time (minutes)',
        metricKeys: ['video_watch_time'], width: 12, height: 4 },
      // 6. Video performance — content placeholder card grid
      { category: 'content', widgetType: 'video_performance', title: 'Video performance',
        width: 12, height: 5 },
    ],
  },
  {
    key: 'instagram_stories_dms',
    name: 'Instagram stories & DMs',
    platforms: ['instagram_business'],
    available: true,
    description: 'Story performance, story replies and mentions, and DM volume across your IG accounts.',
    widgets: [
      // 1. Story replies and mentions KPI + Daily Story replies and mentions
      { category: 'engage', widgetType: 'key_metrics', title: 'Story replies and mentions',
        metricKeys: ['story_replies_mentions'], width: 4, height: 4 },
      { category: 'engage', widgetType: 'time_series', title: 'Daily Story replies and mentions',
        metricKeys: ['story_replies_mentions'], width: 8, height: 4 },
      // 2. Incoming private messages by type (placeholder bar chart)
      { category: 'engage', widgetType: 'metric_by_post_type', title: 'Incoming private messages by type',
        metricKeys: ['incoming_messages'], width: 12, height: 4 },
      // 3. Daily private messages + Total and avg. per day (KPI)
      { category: 'engage', widgetType: 'time_series', title: 'Daily private messages',
        metricKeys: ['incoming_messages'], width: 8, height: 4 },
      { category: 'engage', widgetType: 'key_metrics', title: 'Total and avg. per day',
        metricKeys: ['incoming_messages'], width: 4, height: 4 },
      // 4. Total and avg. per day (story) + Daily Stories posted
      { category: 'engage', widgetType: 'key_metrics', title: 'Total and avg. per day',
        metricKeys: ['posts'], width: 4, height: 4 },
      { category: 'engage', widgetType: 'time_series', title: 'Daily Stories posted',
        metricKeys: ['posts'], width: 8, height: 4 },
      // 5. Channel comparison of Story metrics (per-channel table)
      { category: 'engage', widgetType: 'channel_performance_table', title: 'Channel comparison of Story metrics',
        metricKeys: ['posts','story_replies_mentions','incoming_messages'], width: 12, height: 3 },
      // 6. Story performance (card grid filtered to post_type='story')
      { category: 'content', widgetType: 'story_performance', title: 'Story performance',
        width: 12, height: 5 },
    ],
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
    available: true,
    description: 'Followers, impressions, engagement and audience demographics on your LinkedIn Pages.',
    widgets: [
      // 1. Distribution KPI + Channel engagements KPI
      { category: 'channel', widgetType: 'key_metrics', title: 'Distribution',
        metricKeys: ['impressions','reach_daily_avg'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'key_metrics', title: 'Channel engagements',
        metricKeys: ['interactions','engagement_rate'], width: 6, height: 3 },
      // 3. Fans + Daily fans + Organic vs paid fans
      { category: 'channel', widgetType: 'key_metrics', title: 'Fans',
        metricKeys: ['followers','net_new_followers'], width: 3, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily fans',
        metricKeys: ['followers'], width: 6, height: 4 },
      { category: 'channel', widgetType: 'key_metrics', title: 'Organic vs paid fans',
        metricKeys: ['organic_net_followers','paid_net_followers'], width: 3, height: 4 },
      // 4. Daily reach and impressions + Daily engagements by type
      { category: 'channel', widgetType: 'time_series', title: 'Daily reach and impressions',
        metricKeys: ['impressions','reach_daily'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily engagements by type',
        metricKeys: ['reactions','comments','shares','clicks'], width: 6, height: 3 },
      // 5. Label Performance
      { category: 'content', widgetType: 'label_performance', title: 'Label Performance',
        width: 12, height: 4 },
      // 6. Content performance
      { category: 'content', widgetType: 'content_performance', title: 'Content performance',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      // 7. Video performance (placeholder)
      { category: 'content', widgetType: 'video_performance', title: 'Video performance',
        width: 12, height: 4 },
      // 8. Distribution and engagements by channel (table)
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Distribution and engagements by channel',
        metricKeys: ['impressions','reach_daily','frequency','interactions','engagement_rate'],
        width: 12, height: 3 },
      // 9. Fans by function (placeholder)
      { category: 'channel', widgetType: 'fans_by_function', title: 'Fans by function',
        width: 12, height: 4 },
      // 10. Fans by seniority + Fans by association
      { category: 'channel', widgetType: 'fans_by_seniority', title: 'Fans by seniority',
        width: 6, height: 4 },
      { category: 'channel', widgetType: 'fans_by_association', title: 'Fans by association',
        width: 6, height: 4 },
      // Last: Fans by country
      { category: 'channel', widgetType: 'followers_by_country', title: 'Fans by country',
        width: 12, height: 5 },
    ],
  },
  {
    key: 'twitter_overview',
    name: 'Twitter / X overview',
    platforms: ['twitter'],
    available: true,
    description: 'Followers, tweets, engagements and audience for your X (Twitter) channels.',
    widgets: [
      // 1. Followers KPI + Tweets and retweets KPI
      { category: 'channel', widgetType: 'key_metrics', title: 'Followers',
        metricKeys: ['followers','net_new_followers','following'], width: 8, height: 3 },
      { category: 'channel', widgetType: 'key_metrics', title: 'Tweets and retweets',
        metricKeys: ['net_tweets_retweets'], width: 4, height: 3 },
      // 2. Daily charts side-by-side
      { category: 'channel', widgetType: 'time_series', title: 'Daily net followers',
        metricKeys: ['net_new_followers'], width: 6, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Daily tweets and retweets',
        metricKeys: ['net_tweets_retweets'], width: 6, height: 3 },
      // 3. Label performance
      { category: 'content', widgetType: 'label_performance', title: 'Label performance',
        width: 12, height: 4 },
      // 4. Tweets performance + Organic + Paid
      { category: 'content', widgetType: 'content_performance', title: 'Tweets performance',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      { category: 'content', widgetType: 'content_performance', title: 'Organic tweets performance',
        metricKeys: ['engagement_rate'], width: 12, height: 4 },
      { category: 'content', widgetType: 'paid_performance', title: 'Paid tweets performance',
        width: 12, height: 4 },
      // 5. Video performance (placeholder)
      { category: 'content', widgetType: 'video_performance', title: 'Video performance',
        width: 12, height: 4 },
      // 6. Performance by channel (table)
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Performance by channel',
        metricKeys: ['followers','net_new_followers','net_tweets_retweets','net_listed'],
        width: 12, height: 3 },
    ],
  },
  {
    key: 'youtube_overview',
    name: 'YouTube overview',
    platforms: ['youtube'],
    available: true,
    description: 'Subscribers, views, watch time and engagement across your YouTube channels.',
    widgets: [
      // 1. Summary KPI row
      { category: 'channel', widgetType: 'key_metrics', title: 'Summary',
        metricKeys: ['followers','net_new_followers','interactions','views'],
        width: 12, height: 3 },
      // 3. Subscribers Gained/Lost KPI + over time
      { category: 'channel', widgetType: 'key_metrics', title: 'Subscribers Gained/Lost',
        metricKeys: ['followers_increase','followers_decrease'], width: 4, height: 4 },
      { category: 'channel', widgetType: 'time_series', title: 'Subscribers Gained vs Lost over time',
        metricKeys: ['followers_increase','followers_decrease'], width: 8, height: 4 },
      // 4. Net new subscribers by country (placeholder map+list)
      { category: 'channel', widgetType: 'net_new_subscribers_by_country', title: 'Net new subscribers by country',
        width: 12, height: 5 },
      // 5. Engagements KPI (Likes / Dislikes / Comments / Shares)
      { category: 'channel', widgetType: 'key_metrics', title: 'Engagements',
        metricKeys: ['likes','dislikes','comments','shares'], width: 12, height: 2 },
      // 6. Engagements over time + Shares by source
      { category: 'channel', widgetType: 'time_series', title: 'Engagements over time',
        metricKeys: ['likes','dislikes','comments','shares'], width: 6, height: 4 },
      { category: 'channel', widgetType: 'shares_by_source', title: 'Shares by source',
        width: 6, height: 4 },
      // 7. Engagements by country (placeholder map+list)
      { category: 'channel', widgetType: 'engagements_by_country', title: 'Engagements by country',
        width: 12, height: 5 },
      // 8. Video views KPI + over time
      { category: 'channel', widgetType: 'key_metrics', title: 'Video views',
        metricKeys: ['views'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Video views over time',
        metricKeys: ['views'], width: 8, height: 3 },
      // 9. Top sources by views + Video views by country
      { category: 'channel', widgetType: 'top_sources_by_views', title: 'Top sources by views',
        width: 6, height: 4 },
      { category: 'channel', widgetType: 'video_views_by_country', title: 'Video views by country',
        width: 6, height: 4 },
      // 10. Watch time KPI + over time
      { category: 'channel', widgetType: 'key_metrics', title: 'Watch time (min)',
        metricKeys: ['video_watch_time'], width: 4, height: 3 },
      { category: 'channel', widgetType: 'time_series', title: 'Watch time (min) over time',
        metricKeys: ['video_watch_time'], width: 8, height: 3 },
      // 11. Watch time by country (placeholder)
      { category: 'channel', widgetType: 'watch_time_by_country', title: 'Watch time (min) by country',
        width: 12, height: 5 },
      // 12. Label performance + Content performance + Organic + Paid
      { category: 'content', widgetType: 'label_performance', title: 'Label performance',
        width: 12, height: 4 },
      { category: 'content', widgetType: 'content_performance', title: 'Content performance',
        metricKeys: ['views'], width: 12, height: 4 },
      { category: 'content', widgetType: 'content_performance', title: 'Organic performance',
        metricKeys: ['views'], width: 12, height: 4 },
      { category: 'content', widgetType: 'paid_performance', title: 'Paid performance',
        width: 12, height: 4 },
      // 13. Longform + Shorts
      { category: 'content', widgetType: 'longform_videos_performance', title: 'Longform videos performance',
        width: 12, height: 4 },
      { category: 'content', widgetType: 'shorts_performance', title: 'Shorts performance',
        width: 12, height: 4 },
      // 14. Channel comparison (table)
      { category: 'channel', widgetType: 'channel_performance_table', title: 'Channel comparison',
        metricKeys: ['net_new_followers','interactions','views','video_watch_time'],
        width: 12, height: 3 },
      // 15. Subscribers by country
      { category: 'channel', widgetType: 'followers_by_country', title: 'Subscribers by country',
        width: 12, height: 5 },
      // Last: Per-channel engagement breakdown
      { category: 'channel', widgetType: 'engagements_by_profile', title: 'Engagements by Profile',
        width: 12, height: 3 },
    ],
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
    platforms: ['facebook_page','instagram_business','linkedin','twitter','tiktok','youtube'],
    available: true,
    description: 'Start with an empty canvas and add the widgets you want. Pick which accounts the dashboard scopes to first.',
    widgets: [],
  },
];

export function getTemplate(key) {
  return DASHBOARD_TEMPLATES.find(t => t.key === key) || null;
}
