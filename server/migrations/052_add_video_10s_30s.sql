-- Reversing my mistaken claim that Meta retired the 10s / 30s Page-level
-- video aggregates. Both metrics are present in Graph API v21
-- (page_video_views_10s + page_video_complete_views_30s), so adding the
-- columns and ingesting them properly.
ALTER TABLE channel_insights_daily
  ADD COLUMN video_views_10s INT UNSIGNED NULL AFTER video_views_organic,
  ADD COLUMN video_views_30s INT UNSIGNED NULL AFTER video_views_10s;
