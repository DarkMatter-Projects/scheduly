-- Per-post FB photo tags. Stored as JSON of the shape
-- [{ id, label, x, y }, …] where id is a FB user_id or page_id and
-- x/y are 0-1 normalized coordinates (we convert to FB's 0-100
-- percentage at publish time).
--
-- FB no longer exposes a Graph Search for users/pages to most apps
-- post-Cambridge Analytica, so the composer takes a manual ID +
-- friendly label rather than auto-completing the way IG products do.
ALTER TABLE posts
  ADD COLUMN facebook_photo_tags JSON NULL AFTER geo_twitter_place_id;
