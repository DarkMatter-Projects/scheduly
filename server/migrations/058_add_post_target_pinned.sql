-- Pin state lives on the post_target row (one per published platform)
-- because a single post can be published to multiple platforms and only
-- pinned on some of them.
ALTER TABLE post_targets
  ADD COLUMN is_pinned TINYINT(1) NOT NULL DEFAULT 0 AFTER platform_post_id,
  ADD COLUMN pinned_at DATETIME NULL AFTER is_pinned;
