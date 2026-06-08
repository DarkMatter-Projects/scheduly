-- Per-dashboard timeline annotations. Markers appear as vertical lines on
-- every time-series widget on the dashboard so a viewer can immediately
-- see "this was the campaign launch / holiday / outage".
--
-- dashboard_id NULL + client_id NOT NULL = client-level annotation (renders
-- on every dashboard scoped to that client). dashboard_id NOT NULL means
-- "only this dashboard". Lets the agency annotate "Black Friday push" once
-- per client without copy-pasting.
CREATE TABLE IF NOT EXISTS dashboard_annotations (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dashboard_id  INT UNSIGNED NULL,
  client_id     INT UNSIGNED NULL,
  team_id       INT UNSIGNED NULL,
  occurred_at   DATETIME NOT NULL,
  label         VARCHAR(120) NOT NULL,
  description   TEXT NULL,
  color         VARCHAR(16) NOT NULL DEFAULT '#6366f1',
  created_by    INT UNSIGNED NOT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id)    REFERENCES clients(id)    ON DELETE CASCADE,
  FOREIGN KEY (team_id)      REFERENCES teams(id)      ON DELETE CASCADE,
  FOREIGN KEY (created_by)   REFERENCES users(id)      ON DELETE CASCADE,
  INDEX idx_dashboard (dashboard_id, occurred_at),
  INDEX idx_client    (client_id,    occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
