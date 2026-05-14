-- One row per (scheduly user, TikTok Business identity) that has authorised the app.
-- A single TikTok identity can own many advertiser accounts.
CREATE TABLE IF NOT EXISTS tiktok_oauth_grants (
  id                       INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id                  INT UNSIGNED NOT NULL,
  team_id                  INT UNSIGNED NULL,
  tiktok_user_id           VARCHAR(64) NOT NULL,
  display_name             VARCHAR(255) NULL,
  access_token             TEXT NOT NULL,
  refresh_token            TEXT NULL,
  access_token_expires_at  DATETIME NULL,
  refresh_token_expires_at DATETIME NULL,
  scopes                   VARCHAR(500) NULL,
  is_active                TINYINT(1) NOT NULL DEFAULT 1,
  last_discover_error      VARCHAR(500) NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  UNIQUE KEY uq_tiktok_grant (user_id, tiktok_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
