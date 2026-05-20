-- TikTok-specific publish options that vary per post.
-- post_mode: DIRECT_POST publishes immediately, INBOX uploads to the user's
-- TikTok drafts so they can finish posting in the app.
-- privacy_level: maps directly to TikTok's privacy_level enum. Sandboxed
-- (un-reviewed) apps can only use SELF_ONLY, so that's the safe default.
ALTER TABLE posts
  ADD COLUMN tiktok_post_mode ENUM('DIRECT_POST','INBOX') NULL DEFAULT 'INBOX' AFTER post_type,
  ADD COLUMN tiktok_privacy_level ENUM(
    'PUBLIC_TO_EVERYONE',
    'MUTUAL_FOLLOW_FRIENDS',
    'FOLLOWER_OF_CREATOR',
    'SELF_ONLY'
  ) NULL DEFAULT 'SELF_ONLY' AFTER tiktok_post_mode,
  ADD COLUMN tiktok_disable_duet TINYINT(1) NOT NULL DEFAULT 0 AFTER tiktok_privacy_level,
  ADD COLUMN tiktok_disable_stitch TINYINT(1) NOT NULL DEFAULT 0 AFTER tiktok_disable_duet,
  ADD COLUMN tiktok_disable_comment TINYINT(1) NOT NULL DEFAULT 0 AFTER tiktok_disable_stitch;
