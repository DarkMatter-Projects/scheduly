CREATE TABLE IF NOT EXISTS dashboards (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  -- Template key the dashboard was created from, e.g. 'facebook_overview',
  -- 'instagram_overview', 'paid_performance', 'custom'. Useful for showing
  -- the original template badge and for re-applying template defaults.
  template_key    VARCHAR(64) NULL,
  description     TEXT NULL,
  created_by      INT UNSIGNED NOT NULL,
  team_id         INT UNSIGNED NULL,
  -- Optional client scope. When set, widgets inherit this client filter.
  client_id       INT UNSIGNED NULL,
  -- Default date range for the whole dashboard. Widget configs can still
  -- override per-widget. ENUM keeps stored values constrained.
  default_range   ENUM('7d','14d','30d','90d','custom') NOT NULL DEFAULT '30d',
  range_start     DATE NULL,
  range_end       DATE NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  INDEX idx_dashboards_owner (created_by),
  INDEX idx_dashboards_client (client_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
