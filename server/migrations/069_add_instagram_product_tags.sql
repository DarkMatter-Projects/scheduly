-- Per-post array of IG product tags. Stored as JSON of the shape
-- [{ product_id, x, y, name?, image_url? }, …]. The name + image_url
-- are denormalized at pick time so the composer can re-render the
-- selection without re-hitting the Catalog API; only product_id +
-- x + y are sent to IG at publish.
ALTER TABLE posts
  ADD COLUMN instagram_product_tags JSON NULL AFTER instagram_publish_as_story;
