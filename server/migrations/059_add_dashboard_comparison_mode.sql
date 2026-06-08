-- Comparison window used for delta calculations: 'previous_period' (the
-- existing behaviour — same-length window immediately before the range)
-- vs 'yoy' (the same range, one year earlier).
ALTER TABLE dashboards
  ADD COLUMN comparison_mode ENUM('previous_period','yoy') NOT NULL DEFAULT 'previous_period'
    AFTER default_range;
