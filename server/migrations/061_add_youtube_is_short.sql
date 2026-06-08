-- Tag YouTube uploads as Shorts so the dashboard's Shorts vs long-form
-- performance widgets can split them. The publisher appends the
-- "#Shorts" marker to the description when this is 1, which is how
-- YouTube identifies a Short — combined with a video <= 60s and
-- vertical aspect ratio. Posts uploaded without the flag stay as
-- regular long-form videos.
ALTER TABLE posts
  ADD COLUMN youtube_is_short TINYINT(1) NOT NULL DEFAULT 0 AFTER youtube_made_for_kids;
