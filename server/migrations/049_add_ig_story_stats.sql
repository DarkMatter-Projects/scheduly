-- IG Stories live for 24h so we sample once per day and store the
-- per-day totals here. story_replies + story_shares are summed across
-- every story the account had on the snapshot day.
ALTER TABLE channel_insights_daily
  ADD COLUMN story_replies INT UNSIGNED NULL AFTER listed_count,
  ADD COLUMN story_shares  INT UNSIGNED NULL AFTER story_replies;
