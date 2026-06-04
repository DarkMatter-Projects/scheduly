-- X (Twitter) v2 /users/me?user.fields=public_metrics returns a single
-- snapshot of following_count + tweet_count + listed_count. We store
-- each day's snapshot alongside the existing channel_insights_daily
-- columns; the resolver computes deltas over the dashboard range for
-- the "Net tweets and retweets" and "Net listed" KPIs while
-- "Following" reads the latest snapshot value.
ALTER TABLE channel_insights_daily
  ADD COLUMN following_count INT UNSIGNED NULL AFTER unpaid_fans_added,
  ADD COLUMN tweet_count     INT UNSIGNED NULL AFTER following_count,
  ADD COLUMN listed_count    INT UNSIGNED NULL AFTER tweet_count;
