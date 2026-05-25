-- YouTube videos have a privacy setting separate from FB/IG/TikTok. Defaults
-- to 'private' so an accidental publish never goes public until the user
-- explicitly opts in via the composer.
ALTER TABLE posts
  ADD COLUMN youtube_privacy ENUM('public','unlisted','private') NULL DEFAULT 'private' AFTER tiktok_disable_comment;
