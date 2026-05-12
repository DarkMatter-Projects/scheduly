CREATE TABLE IF NOT EXISTS google_campaigns (
  id                        INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  ad_account_id             INT UNSIGNED NOT NULL,
  platform_campaign_id      VARCHAR(64) NOT NULL,
  name                      VARCHAR(500) NOT NULL,
  status                    VARCHAR(32) NULL,
  advertising_channel_type  VARCHAR(64) NULL,
  start_date                DATE NULL,
  end_date                  DATE NULL,
  daily_budget_micros       BIGINT NULL,
  budget_currency           VARCHAR(8) NULL,
  last_synced_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ad_account_id) REFERENCES google_ad_accounts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_google_campaign (ad_account_id, platform_campaign_id),
  INDEX idx_google_campaigns_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
