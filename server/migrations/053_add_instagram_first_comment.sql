-- Per-post field for the Instagram "first comment" the composer auto-posts
-- on the published media right after the post lands. The same row is
-- reused for any IG target on the post — composing a single first comment
-- that applies to every IG profile the post was scheduled to.
ALTER TABLE posts
  ADD COLUMN instagram_first_comment TEXT NULL AFTER content;
