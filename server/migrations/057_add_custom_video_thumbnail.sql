-- Per-post custom video thumbnail. Stores the media row ID of an
-- uploaded image the publisher should use as the YouTube thumbnail
-- (and FB video thumbnail when supported by the Page API).
ALTER TABLE posts
  ADD COLUMN custom_thumbnail_media_id INT UNSIGNED NULL AFTER instagram_first_comment,
  ADD CONSTRAINT fk_posts_custom_thumb
    FOREIGN KEY (custom_thumbnail_media_id) REFERENCES media(id) ON DELETE SET NULL;
