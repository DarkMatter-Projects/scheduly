-- In-app notifications: bell icon in the navbar reads from this table.
-- Generic shape so other alert types (post failures, share-link viewed,
-- approval requests) can pile in later without another migration.
--
-- target_user_id NULL means "everyone on the team" — read by joining
-- against user_teams when target_user_id IS NULL AND team_id IS NOT NULL.
CREATE TABLE IF NOT EXISTS notifications (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  type            VARCHAR(64) NOT NULL,
  title           VARCHAR(255) NOT NULL,
  body            TEXT NULL,
  link            VARCHAR(500) NULL,
  severity        ENUM('info','warning','error') NOT NULL DEFAULT 'info',
  team_id         INT UNSIGNED NULL,
  target_user_id  INT UNSIGNED NULL,
  is_read         TINYINT(1) NOT NULL DEFAULT 0,
  payload         JSON NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  read_at         DATETIME NULL,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_unread (target_user_id, is_read, created_at),
  INDEX idx_team_unread (team_id, is_read, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
