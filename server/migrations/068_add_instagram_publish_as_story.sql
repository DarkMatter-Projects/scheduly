-- Per-post flag: publish to Instagram as a Story (24h ephemeral)
-- instead of a feed post. media_type on the container changes to
-- STORIES and the post bypasses our usual REELS / CAROUSEL routing.
-- Single image or single video only.
ALTER TABLE posts
  ADD COLUMN instagram_publish_as_story TINYINT(1) NOT NULL DEFAULT 0 AFTER instagram_collaborators;
