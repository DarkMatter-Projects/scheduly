ALTER TABLE posts
  ADD COLUMN imported_from_meta TINYINT(1) NOT NULL DEFAULT 0 AFTER publish_error,
  ADD INDEX idx_posts_imported (imported_from_meta);
