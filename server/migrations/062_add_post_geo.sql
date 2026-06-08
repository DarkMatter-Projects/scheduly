-- Per-post geotag. We store the platform-agnostic display name
-- ("Cape Town, South Africa") plus optional lat/lng coordinates.
--
-- For FB Page posts the place parameter accepts a Page ID, which the
-- caller is expected to look up beforehand. We store the latest
-- geo_facebook_place_id when one was resolved so re-publishing or
-- editing keeps the same place reference.
--
-- X / Twitter v2 posts can attach a place_id from the X Geo API.
-- We store geo_twitter_place_id so the publisher passes it through.
ALTER TABLE posts
  ADD COLUMN geo_label              VARCHAR(255) NULL AFTER youtube_is_short,
  ADD COLUMN geo_lat                DECIMAL(10, 7) NULL AFTER geo_label,
  ADD COLUMN geo_lng                DECIMAL(10, 7) NULL AFTER geo_lat,
  ADD COLUMN geo_facebook_place_id  VARCHAR(64) NULL AFTER geo_lng,
  ADD COLUMN geo_twitter_place_id   VARCHAR(64) NULL AFTER geo_facebook_place_id;
