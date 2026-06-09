-- Reusable caption snippets the composer can insert via dropdown.
-- Two visibility levels:
--   team_id NULL  → personal (only the creator sees it)
--   team_id set   → shared with every member of the team
-- Soft-cap UI to top-100 most-recent so a runaway list doesn't slow
-- the composer dropdown.
CREATE TABLE IF NOT EXISTS caption_snippets (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  team_id     INT UNSIGNED NULL,
  title       VARCHAR(150) NOT NULL,
  body        TEXT NOT NULL,
  created_by  INT UNSIGNED NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_team    (team_id),
  INDEX idx_creator (created_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
