-- YouTube videos have a separate title (max 100 chars on YouTube's side) and
-- a COPPA-mandated "Made for kids" flag. Both ride on the posts row alongside
-- the existing per-platform options.
ALTER TABLE posts
  ADD COLUMN youtube_title VARCHAR(100) NULL AFTER youtube_privacy,
  ADD COLUMN youtube_made_for_kids TINYINT(1) NOT NULL DEFAULT 0 AFTER youtube_title;
