-- FB exposes paid vs organic video views at the Page level via the
-- page_video_views_paid + page_video_views_organic insights metrics
-- (both count 3-second views, matching FB's historical "view"
-- threshold). Storing each as a daily snapshot column.
ALTER TABLE channel_insights_daily
  ADD COLUMN video_views_paid    INT UNSIGNED NULL AFTER linkedin_paid_gain,
  ADD COLUMN video_views_organic INT UNSIGNED NULL AFTER video_views_paid;
