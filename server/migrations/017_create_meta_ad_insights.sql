-- Daily aggregate insights, recorded at account and campaign level.
-- One row per (entity, date). Storing both levels keeps queries cheap:
-- ad-account summaries don't need a join through campaigns.
CREATE TABLE IF NOT EXISTS meta_ad_insights (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ad_account_id     INT UNSIGNED NOT NULL,
  campaign_id       INT UNSIGNED NULL,
  level             ENUM('account','campaign') NOT NULL,
  date_start        DATE NOT NULL,
  spend             DECIMAL(12,2) NULL DEFAULT 0,
  impressions       INT UNSIGNED NULL DEFAULT 0,
  reach             INT UNSIGNED NULL DEFAULT 0,
  clicks            INT UNSIGNED NULL DEFAULT 0,
  unique_clicks     INT UNSIGNED NULL DEFAULT 0,
  ctr               DECIMAL(8,4) NULL,
  cpc               DECIMAL(10,4) NULL,
  cpm               DECIMAL(10,4) NULL,
  frequency         DECIMAL(8,4) NULL,
  conversions       INT UNSIGNED NULL DEFAULT 0,
  conversion_value  DECIMAL(14,2) NULL DEFAULT 0,
  roas              DECIMAL(10,4) NULL,
  fetched_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ad_account_id) REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id)   REFERENCES meta_campaigns(id) ON DELETE CASCADE,
  UNIQUE KEY uq_meta_insight (ad_account_id, campaign_id, level, date_start),
  INDEX idx_meta_insights_date (date_start),
  INDEX idx_meta_insights_account_date (ad_account_id, date_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
