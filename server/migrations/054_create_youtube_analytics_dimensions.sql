-- Per-day per-dimension YouTube Analytics rows. dimension_type discriminates
-- between country breakdowns and traffic-source / sharing-service rows
-- so the same table powers the six dimension widgets (country views,
-- watch time by country, top sources, shares by source, etc.).
CREATE TABLE IF NOT EXISTS youtube_analytics_dimensions (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  social_account_id INT UNSIGNED NOT NULL,
  snapshot_date     DATE NOT NULL,
  dimension_type    ENUM('country','source','sharing') NOT NULL,
  dimension_key     VARCHAR(64) NOT NULL,
  metric_type       ENUM('views','subscribers_gained','engagements','watch_time_seconds','shares') NOT NULL,
  value             INT UNSIGNED NOT NULL DEFAULT 0,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_acct_date_dim_key_metric (social_account_id, snapshot_date, dimension_type, dimension_key, metric_type),
  INDEX idx_acct_dim_metric_date (social_account_id, dimension_type, metric_type, snapshot_date),
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
