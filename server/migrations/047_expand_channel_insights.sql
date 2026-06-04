-- Phase 6 of dashboards data work: capture every page-level Meta number
-- we previously rendered as "Coming soon". One row per
-- (social_account_id, snapshot_date) in channel_insights_daily, so all
-- the additions fit on the existing daily snapshot.
--
-- Video views / viewers / watch time / repeated views — sourced from FB
--   page_video_views, page_video_views_unique, page_video_view_time,
--   page_video_repeat_views (YouTube Analytics fills these via the daily
--   reports endpoint).
-- Impressions breakdown — sourced from FB page_impressions_organic_v2,
--   page_impressions_paid, page_impressions_viral_unique,
--   page_impressions_nonviral_unique.
-- Reach breakdown — sourced from page_impressions_organic_unique,
--   page_impressions_viral_unique, page_impressions_nonviral_unique.
-- Fan source — sourced from page_fans_by_like_source (paid_fans_added) and
--   page_fans_by_unlike_source (unpaid_fans_added is the difference between
--   like_source.total and like_source.paid).
ALTER TABLE channel_insights_daily
  ADD COLUMN video_views          INT UNSIGNED NULL AFTER reach_unique,
  ADD COLUMN video_views_unique   INT UNSIGNED NULL AFTER video_views,
  ADD COLUMN video_view_time      INT UNSIGNED NULL AFTER video_views_unique,
  ADD COLUMN video_repeat_views   INT UNSIGNED NULL AFTER video_view_time,
  ADD COLUMN impressions_organic  INT UNSIGNED NULL AFTER video_repeat_views,
  ADD COLUMN impressions_paid     INT UNSIGNED NULL AFTER impressions_organic,
  ADD COLUMN impressions_viral    INT UNSIGNED NULL AFTER impressions_paid,
  ADD COLUMN impressions_nonviral INT UNSIGNED NULL AFTER impressions_viral,
  ADD COLUMN reach_organic        INT UNSIGNED NULL AFTER impressions_nonviral,
  ADD COLUMN reach_viral          INT UNSIGNED NULL AFTER reach_organic,
  ADD COLUMN reach_nonviral       INT UNSIGNED NULL AFTER reach_viral,
  ADD COLUMN paid_fans_added      INT UNSIGNED NULL AFTER reach_nonviral,
  ADD COLUMN unpaid_fans_added    INT UNSIGNED NULL AFTER paid_fans_added;
