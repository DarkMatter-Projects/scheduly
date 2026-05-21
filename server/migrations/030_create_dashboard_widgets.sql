CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  dashboard_id    INT UNSIGNED NOT NULL,
  -- Top-level metric category from the picker UI.
  category        ENUM('channel','content','engage') NOT NULL DEFAULT 'channel',
  -- The visual: key_metrics | time_series | channel_comparison |
  -- network_comparison | breakdown | demographics | geographics |
  -- content_performance | label_performance
  widget_type     VARCHAR(64) NOT NULL,
  title           VARCHAR(255) NULL,
  -- social_account ids the widget pulls from. JSON array of ints.
  -- Empty/NULL = all channels the user can see (inherits dashboard scope).
  channel_ids     JSON NULL,
  -- Selected metric keys, JSON array of strings. e.g. ["followers","engagement_rate"]
  metric_keys     JSON NULL,
  -- Free-form per-widget config — granularity, comparison flag, sort, etc.
  config          JSON NULL,
  -- 12-column grid placement. position is a 0-based ordinal for save/load
  -- ordering; width/height drive the responsive layout.
  position        INT UNSIGNED NOT NULL DEFAULT 0,
  width           TINYINT UNSIGNED NOT NULL DEFAULT 4,
  height          TINYINT UNSIGNED NOT NULL DEFAULT 2,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE,
  INDEX idx_dashboard_widgets_dash (dashboard_id, position)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
