-- Reusable "canned" replies for the Engage inbox. Saved per team so an
-- agency's editors share the same template library.
CREATE TABLE IF NOT EXISTS engage_reply_templates (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id      INT UNSIGNED NULL,
  user_id      INT UNSIGNED NOT NULL,
  name         VARCHAR(120) NOT NULL,
  body         TEXT NOT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_engage_templates_team (team_id, name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
