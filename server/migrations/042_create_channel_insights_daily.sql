-- Daily snapshot of Page-level insights for each connected channel.
-- Populated by the channelInsights cron, used by widgets like
-- Engaged users, Profile views, Profile taps. One row per
-- (social_account_id, snapshot_date).
CREATE TABLE IF NOT EXISTS channel_insights_daily (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  social_account_id   INT UNSIGNED NOT NULL,
  snapshot_date       DATE NOT NULL,
  engaged_users       INT UNSIGNED NULL,
  profile_views       INT UNSIGNED NULL,
  profile_taps        INT UNSIGNED NULL,
  follower_views      INT UNSIGNED NULL,
  non_follower_views  INT UNSIGNED NULL,
  reach_unique        INT UNSIGNED NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_account_date (social_account_id, snapshot_date),
  INDEX idx_account_date (social_account_id, snapshot_date),
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
