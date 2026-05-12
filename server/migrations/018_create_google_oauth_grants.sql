-- One row per (scheduly user, Google identity) that has authorised the app.
-- A single Google identity can own many Google Ads customer accounts (rows
-- in google_ad_accounts), so we keep the refresh token here and share it.
CREATE TABLE IF NOT EXISTS google_oauth_grants (
  id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                  INT UNSIGNED NOT NULL,
  team_id                  INT UNSIGNED NULL,
  google_email             VARCHAR(255) NOT NULL,
  refresh_token            TEXT NOT NULL,
  access_token             TEXT NULL,
  access_token_expires_at  DATETIME NULL,
  scopes                   VARCHAR(500) NULL,
  is_active                TINYINT(1) NOT NULL DEFAULT 1,
  last_discover_error      VARCHAR(500) NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  UNIQUE KEY uq_google_grant (user_id, google_email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
