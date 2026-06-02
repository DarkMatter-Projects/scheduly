-- Audience demographics per connected channel — country and gender_age
-- breakdowns from Meta Page Insights. One row per (account, snapshot_date,
-- dimension, key) so we can store both axes in the same shape and query
-- either with a simple WHERE dimension = 'country' / 'gender_age'.
--
-- `dimension_key` examples:
--   country     → ISO code 'ZA', 'US', ...
--   gender_age  → 'F.25-34', 'M.18-24', 'U.65+' (gender.age_bracket)
CREATE TABLE IF NOT EXISTS channel_demographics (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  social_account_id   INT UNSIGNED NOT NULL,
  snapshot_date       DATE NOT NULL,
  dimension           ENUM('country','gender_age') NOT NULL,
  dimension_key       VARCHAR(32) NOT NULL,
  fans_count          INT UNSIGNED NOT NULL DEFAULT 0,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_acct_date_dim_key (social_account_id, snapshot_date, dimension, dimension_key),
  INDEX idx_acct_dim_date (social_account_id, dimension, snapshot_date),
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
