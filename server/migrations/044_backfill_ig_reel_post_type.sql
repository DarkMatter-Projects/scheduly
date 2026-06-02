-- One-shot backfill: any post with post_type='video' that was published
-- to an Instagram Business account is actually a Reel (IG Graph publishes
-- every single-video post as REELS — see instagram.service.js). Phase 2
-- migration 041 added the 'reel' enum value and the publisher now tags
-- new ones; this fills in the historical rows so dashboard "by post
-- type" widgets bucket old posts correctly.
UPDATE posts p
SET p.post_type = 'reel'
WHERE p.post_type = 'video'
  AND EXISTS (
    SELECT 1
    FROM post_targets pt
    JOIN social_accounts sa ON pt.social_account_id = sa.id
    WHERE pt.post_id = p.id
      AND sa.platform = 'instagram_business'
  );
