// Single source of truth for which metrics a dashboard widget can use.
// `source` drives the data resolver below — keep these in sync.
// `available: false` means the schema doesn't collect the data yet and the
// picker should show it disabled rather than hiding it.
// `deprecated: true` means Meta / the platform retired the metric — picker
// shows a warning badge and the resolver returns 0.
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
  { key: 'net_new_followers',   label: 'Net new followers',   section: 'followers',   category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','twitter','tiktok','youtube'], format: 'number',   source: 'follower_history.delta',  available: true,
    scope: 'channel',
    description: 'This metric counts the daily net fluctuations of your followers (Facebook, Instagram, TikTok, YouTube). Instagram requires at least 100 followers to be available.' },
  { key: 'followers_increase',  label: 'Followers increase',  section: 'followers',   category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','youtube'], format: 'number',   source: 'follower_history.gain',          available: true,
    scope: 'channel',
    description: 'New follows during the period. Computed as the sum of positive daily deltas in follower_history.' },
  { key: 'followers_decrease',  label: 'Followers decrease',  section: 'followers',   category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','youtube'], format: 'number',   source: 'follower_history.loss',          available: true,
    scope: 'channel',
    description: 'Unfollows during the period. Computed as the absolute sum of negative daily deltas in follower_history.' },
  { key: 'unpaid_fans_increase', label: 'Unpaid fans increase', section: 'followers', category: 'channel', platforms: ['facebook_page'],                                            format: 'number',   source: 'derived.unpaid_fans_increase',   available: true,
    scope: 'channel',
    description: 'Organic new Page fans (not from paid ads). Sourced from page_fans_by_like_source minus the paid bucket.' },
  { key: 'paid_fans_increase',  label: 'Paid fans increase',  section: 'followers',   category: 'channel', platforms: ['facebook_page'],                                            format: 'number',   source: 'derived.paid_fans_increase',     available: true,
    scope: 'channel',
    description: 'New Page fans acquired via paid ad campaigns. Sourced from page_fans_by_like_source paid bucket.' },

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
  { key: 'organic_views',       label: 'Organic views',       section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number',   source: 'post_analytics.impressions',    available: true,
    scope: 'content',
    description: 'Impressions on posts published organically (i.e. not promoted through ads) during the period.' },
  { key: 'paid_views',          label: 'Paid views',          section: 'distribution', category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],          format: 'number',   source: 'ad_insights.impressions',       available: true,
    scope: 'channel',
    description: 'Impressions served from paid ad campaigns during the period.' },
  { key: 'follower_views',      label: 'Follower views',      section: 'distribution', category: 'channel', platforms: ['facebook_page'],                               format: 'number',   source: 'derived.follower_views',        available: true,
    scope: 'channel',
    description: 'Views from users who follow your Page (page_impressions_by_user_type.fan).' },
  { key: 'non_follower_views',  label: 'Non-Follower views',  section: 'distribution', category: 'channel', platforms: ['facebook_page'],                               format: 'number',   source: 'derived.non_follower_views',    available: true,
    scope: 'channel',
    description: 'Views from users who do not follow your Page (page_impressions_by_user_type.non_fan).' },
  { key: 'paid_reach_daily_avg', label: 'Paid reach (daily) avg.', section: 'distribution', category: 'channel', platforms: ['meta_ads','google_ads','tiktok_ads'],     format: 'number',   source: 'derived.paid_reach_daily_avg',  available: true,
    scope: 'channel',
    description: 'The daily number of people reached by paid ad campaigns. Calculated as total ad reach divided by days in the range.' },
  { key: 'viral_reach_daily_avg', label: 'Viral reach (daily) avg.', section: 'distribution', category: 'channel', platforms: ['facebook_page'],                        format: 'number',   source: 'derived.viral_reach_daily_avg', available: true,
    scope: 'channel',
    description: 'Reach attributed to viral content (shares, friend stories). Daily average of page_impressions_viral_unique.' },
  { key: 'non_viral_reach_daily_avg', label: 'Non-viral reach (daily) avg.', section: 'distribution', category: 'channel', platforms: ['facebook_page'],               format: 'number',   source: 'derived.non_viral_reach_daily_avg', available: true,
    scope: 'channel',
    description: 'Reach from non-viral sources (direct fans, ads). Daily average of page_impressions_nonviral_unique.' },
  { key: 'paid_impressions',    label: 'Paid impressions',    section: 'distribution', category: 'channel', platforms: ['facebook_page'],                                format: 'number',   source: 'ad_insights.impressions',       available: true,
    scope: 'channel',
    description: 'Impressions served by paid ad campaigns during the period.' },
  { key: 'reach_daily',         label: 'Reach (daily)',       section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok'], format: 'number',   source: 'post_analytics.reach',          available: true,
    scope: 'content',
    description: 'Daily unique people reached. Use the daily visualisation to read accurately.' },
  { key: 'organic_reach_daily', label: 'Organic reach (daily)', section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business'],         format: 'number',   source: 'derived.organic_reach_daily',   available: true,
    scope: 'channel',
    description: 'Daily unique reach from organic posts only (no ads). Sourced from page_impressions_organic_unique.' },
  { key: 'frequency',           label: 'Frequency',           section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin'], format: 'multiplier', source: 'derived.frequency',           available: true,
    scope: 'channel',
    description: 'Average number of times each person saw your content. Formula: Impressions / Reach.' },
  { key: 'channel_profile_views', label: 'Channel profile views', section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok'], format: 'number', source: 'derived.channel_profile_views', available: true,
    scope: 'channel',
    description: 'Number of times your profile/Page was visited. Sourced from page_views_total (FB) / profile_views (IG).' },
  { key: 'profile_taps',        label: 'Profile activity by type', section: 'distribution', category: 'channel', platforms: ['facebook_page','instagram_business'],     format: 'number',   source: 'derived.profile_taps',          available: true,
    scope: 'channel',
    description: 'Profile CTA taps (call, email, directions, website). Sourced from page_total_actions (FB) / website_clicks (IG).' },
  { key: 'reposts',             label: 'Reposts',             section: 'engagements', category: 'channel', platforms: ['instagram_business'],                          format: 'number',   source: 'derived.reposts',               available: true,
    scope: 'content',
    description: 'Times Instagram users reshared your stories to their own. Sourced from Story Insights "shares" metric, summed daily.' },
  { key: 'dislikes',            label: 'Dislikes',            section: 'engagements', category: 'channel', platforms: ['youtube'],                                     format: 'number',   source: 'derived.dislikes',              available: false,
    scope: 'content',
    description: 'Dislike count. YouTube made dislike counts private in November 2021 — values stay at 0 until/unless YouTube re-enables the API.' },
  { key: 'organic_net_followers', label: 'Organic net followers', section: 'followers', category: 'channel', platforms: ['linkedin'],                                  format: 'number',   source: 'derived.organic_net_followers', available: true,
    scope: 'channel',
    description: 'Net new organic follows during the period. Sourced from organizationalEntityFollowerStatistics.organicFollowerGain (needs r_organization_social).' },
  { key: 'paid_net_followers',  label: 'Paid net followers',  section: 'followers',   category: 'channel', platforms: ['linkedin'],                                    format: 'number',   source: 'derived.paid_net_followers',     available: true,
    scope: 'channel',
    description: 'Net new follows acquired via paid LinkedIn ad campaigns. Sourced from organizationalEntityFollowerStatistics.paidFollowerGain (needs Marketing Developer Platform scopes).' },
  { key: 'following',           label: 'Following',           section: 'followers',   category: 'channel', platforms: ['twitter'],                                     format: 'number',   source: 'derived.following',              available: true,
    scope: 'channel',
    description: 'Number of accounts your channel follows. Sourced from X /2/users/me public_metrics.following_count snapshots.' },
  { key: 'net_tweets_retweets', label: 'Net tweets and retweets', section: 'engagements', category: 'channel', platforms: ['twitter'],                                 format: 'number',   source: 'derived.net_tweets_retweets',    available: true,
    scope: 'content',
    description: 'Net change in tweets + retweets during the period. Computed as the delta of public_metrics.tweet_count between the first and last snapshots in range.' },
  { key: 'net_listed',          label: 'Net listed',          section: 'followers',   category: 'channel', platforms: ['twitter'],                                     format: 'number',   source: 'derived.net_listed',             available: true,
    scope: 'channel',
    description: 'Net change in the number of public lists your account appears on during the period. Computed as the delta of public_metrics.listed_count.' },
  // ── FB distribution breakdowns (live via channel_insights ingestion) ──
  { key: 'organic_impressions', label: 'Organic impressions', section: 'distribution', category: 'channel', platforms: ['facebook_page'],                                format: 'number',   source: 'derived.organic_impressions',   available: true,
    scope: 'channel',
    description: 'Impressions on posts not boosted by ads. Sourced from page_impressions_organic_v2.' },
  { key: 'viral_impressions',   label: 'Viral impressions',   section: 'distribution', category: 'channel', platforms: ['facebook_page'],                                format: 'number',   source: 'derived.viral_impressions',     available: true,
    scope: 'channel',
    description: 'Impressions from viral stories. Sourced from page_impressions_viral_unique.' },
  { key: 'non_viral_impressions', label: 'Non-viral impressions', section: 'distribution', category: 'channel', platforms: ['facebook_page'],                            format: 'number',   source: 'derived.non_viral_impressions', available: true,
    scope: 'channel',
    description: 'Impressions from direct/owned distribution. Sourced from page_impressions_nonviral_unique.' },
  { key: 'viral_amplification', label: 'Viral amplification', section: 'distribution', category: 'channel', platforms: ['facebook_page'],                                format: 'percent',  source: 'derived.viral_amplification',   available: true,
    scope: 'channel',
    description: 'Share of impressions resulting from people sharing your posts. Formula: 100 * viral_impressions / (organic_impressions + paid_impressions).' },
  { key: 'reactions',           label: 'Reactions',           section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok','youtube'], format: 'number',   source: 'post_analytics.likes',          available: true,
    scope: 'content',
    description: 'Total reactions across all types (Like, Love, Haha, Wow, Sad, Angry) on posts published in the period.' },

  // ── Video views (Page-level video insights — most not yet collected) ──
  { key: 'video_views',         label: 'Video views',         section: 'video',       category: 'channel', platforms: ['facebook_page','tiktok','youtube'],            format: 'number',   source: 'derived.video_views',           available: true,
    scope: 'content',
    description: 'Total number of times videos in your posts were viewed. Sourced from page_video_views (FB) / Analytics views (YouTube).' },
  { key: 'paid_video_views_3s', label: 'Paid video views (3s)', section: 'video',     category: 'channel', platforms: ['facebook_page'],                                format: 'number',   source: 'derived.paid_video_views_3s',   available: true,
    scope: 'channel',
    description: '3-second video views served via paid placements. Sourced from page_video_views_paid.' },
  { key: 'organic_video_views_3s', label: 'Organic video views (3s)', section: 'video', category: 'channel', platforms: ['facebook_page'],                              format: 'number',   source: 'derived.organic_video_views_3s', available: true,
    scope: 'content',
    description: '3-second video views from organic posts only. Sourced from page_video_views_organic.' },
  { key: 'video_views_10s',     label: 'Video views (10s)',   section: 'video',       category: 'channel', platforms: ['facebook_page'],                                format: 'number',   source: 'derived.video_views_10s',       available: true,
    scope: 'content',
    description: '10-second video views. Sourced from page_video_views_10s.' },
  { key: 'video_views_30s',     label: 'Video views (30s)',   section: 'video',       category: 'channel', platforms: ['facebook_page'],                                format: 'number',   source: 'derived.video_views_30s',       available: true,
    scope: 'content',
    description: '30-second / complete video views. Sourced from page_video_complete_views_30s.' },
  { key: 'video_watch_time',    label: 'Watch time',          section: 'video',       category: 'channel', platforms: ['facebook_page','youtube'],                     format: 'number',   source: 'derived.video_watch_time',      available: true,
    scope: 'content',
    description: 'Total seconds of video watch time. Sourced from page_video_view_time (FB) / estimatedMinutesWatched (YouTube).' },
  { key: 'video_viewers',       label: 'Video viewers',       section: 'video',       category: 'channel', platforms: ['facebook_page'],                                format: 'number',   source: 'derived.video_viewers',         available: true,
    scope: 'content',
    description: 'Unique users who watched any video in the period. Sourced from page_video_views_unique.' },
  { key: 'repeated_video_views', label: 'Repeated video views', section: 'video',     category: 'channel', platforms: ['facebook_page'],                                format: 'number',   source: 'derived.repeated_video_views',  available: true,
    scope: 'content',
    description: 'Number of viewers who replayed a video. Sourced from page_video_repeat_views.' },

  // ── Direct messages (Page-level inbox insights — not yet collected) ──
  { key: 'new_dm_conversations', label: 'New DM conversations', section: 'direct_messages', category: 'engage', platforms: ['facebook_page','instagram_business'],     format: 'number',   source: 'derived.new_dm_conversations',  available: true,
    scope: 'engage',
    description: 'DM conversations whose first incoming message landed inside the period. Derived from engage_threads.source_type = "dm" + MIN(engage_messages.sent_at).' },
  { key: 'blocked_dm_conversations', label: 'Blocked DM conversations', section: 'direct_messages', category: 'engage', platforms: ['facebook_page'],                  format: 'number',   source: 'derived.blocked_dm_conversations', available: true,
    scope: 'engage',
    description: 'Conversations the Page admin blocked during the period. Sourced from page_messages_blocked_conversations_unique.' },
  { key: 'story_replies_mentions', label: 'Story replies and mentions', section: 'engage', category: 'engage', platforms: ['instagram_business'],                       format: 'number',   source: 'derived.story_replies_mentions', available: true,
    scope: 'engage',
    description: 'Replies received on your Stories during the period. Sourced from Story Insights "replies" metric, summed daily.' },

  // ── Audience demographics (per-country fan breakdown — not yet collected) ──
  { key: 'fans_by_country',     label: 'Followers by country', section: 'fans',       category: 'channel', platforms: ['facebook_page','instagram_business'],          format: 'number',   source: 'derived.fans_by_country',       available: true,
    scope: 'channel',
    description: 'Follower counts broken down by country. Sourced from page_fans_country (FB) / follower_demographics by country (IG).' },

  // ── Engagements ──
  { key: 'likes',               label: 'Likes',               section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','tiktok','youtube'], format: 'number',   source: 'post_analytics.likes',          available: true,
    scope: 'content',
    description: 'The total number of likes (or reactions on Facebook) on posts during the period.' },
  { key: 'comments',            label: 'Comments',            section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok','youtube'], format: 'number',   source: 'post_analytics.comments_count', available: true,
    scope: 'content',
    description: 'The total number of comments left on posts during the period.' },
  { key: 'shares',              label: 'Shares',              section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok','youtube'], format: 'number',   source: 'post_analytics.shares',         available: true,
    scope: 'content',
    description: 'The number of times your posts were shared during the period.' },
  { key: 'saves',               label: 'Saves',               section: 'engagements', category: 'channel', platforms: ['instagram_business'],                          format: 'number',   source: 'post_analytics.saves',          available: true,
    scope: 'content',
    description: 'The number of times Instagram users saved your posts during the period.' },
  { key: 'engagement_rate',     label: 'Engagement rate',     section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok'], format: 'percent',  source: 'derived.engagement_rate',       available: true,
    scope: 'content',
    description: 'Engagements divided by impressions, averaged across posts published in the period.' },
  { key: 'profile_cta_clicks',  label: 'Profile CTA clicks',  section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business'],          format: 'number',   source: 'derived.profile_cta_clicks',    available: true,
    scope: 'channel',
    description: 'Clicks on the call-to-action button on your profile (Call, Email, Directions, etc.). Sourced from page_total_actions / website_clicks.' },
  { key: 'clicks',              label: 'Clicks',              section: 'engagements', category: 'channel', platforms: ['facebook_page','linkedin'],                    format: 'number',   source: 'post_analytics.clicks',         available: true,
    scope: 'content',
    description: 'The total number of clicks on links, photos and other content within your posts.' },
  { key: 'interactions',        label: 'Interactions',        section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok','youtube'], format: 'number',   source: 'derived.interactions',          available: true,
    scope: 'content',
    description: 'The number of Reactions, Comments, Shares, Saves (IG), Reposts (IG) and Clicks (FB and LI) on your posts during the period.' },
  { key: 'interaction_rate',    label: 'Interaction Rate',    section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok'], format: 'percent', source: 'derived.interaction_rate',    available: true,
    scope: 'content',
    description: 'Interactions as a percentage of impressions. Formula: 100 * Interactions / Impressions (Views).' },
  { key: 'interaction_rate_reach', label: 'Interaction Rate (Reach)', section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok'], format: 'percent', source: 'derived.interaction_rate_reach', available: true,
    scope: 'content',
    description: 'Interactions as a percentage of reach. Formula: 100 * Interactions / Reach.' },
  { key: 'engagement_rate_reach', label: 'Engagement rate (reach)', section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business','linkedin','tiktok'], format: 'percent', source: 'derived.engagement_rate_reach', available: true,
    scope: 'content',
    description: 'Engagements (reactions, comments, shares, saves) as a percentage of unique reach. Formula: 100 * Engagements / Reach.' },
  { key: 'engaged_users_daily_avg', label: 'Engaged users (daily) avg.', section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business'], format: 'number', source: 'derived.engaged_users_daily_avg', available: true,
    scope: 'channel',
    description: 'Daily unique users who took any action on your content, totalled across the period. Sourced from page_engaged_users (FB) / accounts_engaged (IG).' },
  { key: 'engaged_users_rate',  label: 'Engaged users rate',  section: 'engagements', category: 'channel', platforms: ['facebook_page','instagram_business'], format: 'percent', source: 'derived.engaged_users_rate', available: true,
    scope: 'channel',
    description: 'Engaged users as a percentage of reach. Formula: 100 * engaged_users / reach.' },
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
  { key: 'incoming_messages',   label: 'Incoming messages',   section: 'engage',       category: 'engage',  platforms: ['facebook_page','instagram_business','linkedin','tiktok'], format: 'number',   source: 'engage_messages.incoming',      available: true,
    scope: 'engage',
    description: 'The number of comments and DMs received in the Engage inbox during the period.' },
  { key: 'engage_direct_messages', label: 'Direct messages', section: 'engage',         category: 'engage',  platforms: ['facebook_page','instagram_business'],                       format: 'number',   source: 'engage_messages.direct',        available: true,
    scope: 'engage',
    description: 'Direct messages received during the period. Counts engage_messages where the parent thread.source_type = "dm".' },
  { key: 'engage_fan_posts',    label: 'Fan posts',           section: 'engage',       category: 'engage',  platforms: ['facebook_page'],                                            format: 'number',   source: 'derived.fan_posts',              available: true,
    scope: 'engage',
    description: 'Posts created by fans on your Page during the period. Sourced from /me/visitor_posts.' },
  { key: 'engage_mentions',     label: 'Mentions',            section: 'engage',       category: 'engage',  platforms: ['instagram_business','linkedin'],                            format: 'number',   source: 'engage_messages.mention',        available: true,
    scope: 'engage',
    description: '@mentions of your channel during the period. Counts engage_messages where the parent thread.source_type = "mention".' },
  { key: 'engage_comments_inbox', label: 'Comments',          section: 'engage',       category: 'engage',  platforms: ['facebook_page','instagram_business','linkedin','tiktok'],  format: 'number',   source: 'engage_messages.comment',        available: true,
    scope: 'engage',
    description: 'Comments left on your posts during the period. Counts engage_messages where the parent thread.source_type = "comment".' },
  { key: 'engage_reviews',      label: 'Reviews',             section: 'engage',       category: 'engage',  platforms: ['facebook_page'],                                            format: 'number',   source: 'derived.reviews',                available: true,
    scope: 'engage',
    description: 'Reviews left on your Page during the period. Sourced from /me/ratings.' },
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
  if (m.source === 'derived.engagement_rate_reach') return 'organic';
  if (m.source === 'derived.interaction_rate') return 'organic';
  if (m.source === 'derived.interaction_rate_reach') return 'organic';
  if (m.source === 'derived.interactions') return 'organic';
  if (m.source === 'derived.reach_daily_avg') return 'organic';
  if (m.source === 'derived.frequency') return 'organic';
  if (m.source.startsWith('follower_history.')) return 'followers';
  if (m.source.startsWith('ad_insights.')) return 'paid';
  if (m.source.startsWith('derived.') && ['ctr','cpc','cpm','roas','paid_reach_daily_avg'].includes(key)) return 'paid';
  if (m.source.startsWith('engage_messages.')) return 'engage';
  if (m.source === 'derived.engage_negative_rate') return 'engage';
  if (m.source === 'derived.new_dm_conversations') return 'engage';
  return null;
}

module.exports = { METRICS, METRICS_BY_KEY, metric, metricFamily };
