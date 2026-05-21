-- Store the public URL of the post a comment-thread is anchored to.
-- For IG we need the permalink Meta returns; for FB we can build a URL
-- from the post id, but storing the absolute URL avoids per-platform logic.
ALTER TABLE engage_threads
  ADD COLUMN platform_post_url VARCHAR(500) NULL AFTER platform_post_id;
