-- Daily follower-count snapshots per connected social account. The dashboard
-- 'Followers' metric reads the latest row on or before the period end; the
-- 'Net new followers' metric sums delta_count in the range.
--
-- delta_count is computed at insert time as (this snapshot - previous snapshot)
-- for the same social_account_id. First snapshot for an account stores 0 so
-- the row never appears as misleading growth on day one.
CREATE TABLE IF NOT EXISTS follower_history (
  id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  social_account_id  INT UNSIGNED NOT NULL,
  snapshot_date      DATE NOT NULL,
  followers_count    INT NOT NULL DEFAULT 0,
  delta_count        INT NOT NULL DEFAULT 0,
  source             VARCHAR(32) NOT NULL DEFAULT 'api',
  created_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_account_date (social_account_id, snapshot_date),
  INDEX idx_account_date (social_account_id, snapshot_date),
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
