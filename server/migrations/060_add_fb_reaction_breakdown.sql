-- FB exposes per-type page-reaction totals via these Page Insights
-- metrics. Stored daily so reaction_breakdown can SUM over the range.
-- (Meta historically named "sad" -> "sorry" and "angry" -> "anger".)
ALTER TABLE channel_insights_daily
  ADD COLUMN reactions_like  INT UNSIGNED NULL AFTER video_views_30s,
  ADD COLUMN reactions_love  INT UNSIGNED NULL AFTER reactions_like,
  ADD COLUMN reactions_haha  INT UNSIGNED NULL AFTER reactions_love,
  ADD COLUMN reactions_wow   INT UNSIGNED NULL AFTER reactions_haha,
  ADD COLUMN reactions_sorry INT UNSIGNED NULL AFTER reactions_wow,
  ADD COLUMN reactions_anger INT UNSIGNED NULL AFTER reactions_sorry;
