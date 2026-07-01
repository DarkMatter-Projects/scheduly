-- TikTok Content Sharing Guidelines § 3: commercial content disclosure.
-- When the user turns on the disclosure toggle, they must pick at least
-- one of the two sub-checkboxes. We persist all three so the publisher
-- can send brand_content_toggle + brand_organic_toggle to
-- /post/publish/video/init/ and so the Edit page can pre-fill.
ALTER TABLE posts
  ADD COLUMN tiktok_commercial_disclosure TINYINT(1) NOT NULL DEFAULT 0 AFTER tiktok_disable_comment,
  ADD COLUMN tiktok_your_brand            TINYINT(1) NOT NULL DEFAULT 0 AFTER tiktok_commercial_disclosure,
  ADD COLUMN tiktok_branded_content       TINYINT(1) NOT NULL DEFAULT 0 AFTER tiktok_your_brand;
