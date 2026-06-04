-- Final batch of channel_insights columns covering the last "Coming
-- soon" metrics that have a real upstream API:
--
-- fan_posts_count       — count of /me/visitor_posts created on the day
-- reviews_count         — count of /me/ratings created on the day
-- blocked_dm_count      — page_messages_blocked_conversations_unique
-- linkedin_organic_gain — organicFollowerGain from
--                         organizationalEntityFollowerStatistics
-- linkedin_paid_gain    — paidFollowerGain from the same endpoint
ALTER TABLE channel_insights_daily
  ADD COLUMN fan_posts_count       INT UNSIGNED NULL AFTER story_shares,
  ADD COLUMN reviews_count         INT UNSIGNED NULL AFTER fan_posts_count,
  ADD COLUMN blocked_dm_count      INT UNSIGNED NULL AFTER reviews_count,
  ADD COLUMN linkedin_organic_gain INT UNSIGNED NULL AFTER blocked_dm_count,
  ADD COLUMN linkedin_paid_gain    INT UNSIGNED NULL AFTER linkedin_organic_gain;
