-- White-labeling for shared dashboards. Logo + tagline appear in the
-- shared dashboard header so clients see their own brand instead of
-- Scheduly's. Color was already a thing (used for dashboard accents);
-- now drives the share-link header background too.
ALTER TABLE clients
  ADD COLUMN logo_url VARCHAR(500) NULL AFTER color,
  ADD COLUMN tagline  VARCHAR(255) NULL AFTER logo_url;
