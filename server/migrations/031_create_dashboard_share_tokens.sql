CREATE TABLE IF NOT EXISTS dashboard_share_tokens (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dashboard_id    INT UNSIGNED NOT NULL,
  -- Random URL-safe token used in the public viewer URL.
  token           VARCHAR(64) NOT NULL,
  -- View-only for now. Future: 'edit' for collab links.
  access          ENUM('view') NOT NULL DEFAULT 'view',
  -- NULL = no expiry. Otherwise viewer is rejected after this timestamp.
  expires_at      DATETIME NULL,
  -- When revoked the token returns 410 Gone to viewers.
  revoked_at      DATETIME NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_viewed_at  DATETIME NULL,
  view_count      INT UNSIGNED NOT NULL DEFAULT 0,
  UNIQUE KEY uq_dashboard_share_token (token),
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id),
  INDEX idx_dashboard_share_active (dashboard_id, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
