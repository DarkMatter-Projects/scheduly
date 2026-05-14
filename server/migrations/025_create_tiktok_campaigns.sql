CREATE TABLE IF NOT EXISTS tiktok_campaigns (
  id                        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ad_account_id             INT UNSIGNED NOT NULL,
  platform_campaign_id      VARCHAR(64) NOT NULL,
  name                      VARCHAR(500) NOT NULL,
  status                    VARCHAR(32) NULL,
  objective_type            VARCHAR(64) NULL,
  budget                    DECIMAL(14,2) NULL,
  budget_mode               VARCHAR(32) NULL,
  start_date                DATE NULL,
  end_date                  DATE NULL,
  last_synced_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ad_account_id) REFERENCES tiktok_ad_accounts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_tiktok_campaign (ad_account_id, platform_campaign_id),
  INDEX idx_tiktok_campaigns_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
