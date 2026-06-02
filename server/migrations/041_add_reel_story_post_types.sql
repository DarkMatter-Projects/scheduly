-- Extend posts.post_type to distinguish Instagram Reels and Stories from
-- regular feed posts. The IG publisher tags video posts as 'reel' on
-- successful publish so dashboard "by post type" widgets can group
-- correctly (a Reel and a feed video are very different visibility
-- vehicles even though the underlying media is the same).
ALTER TABLE posts
  MODIFY post_type ENUM('text','image','video','carousel','reel','story')
  NOT NULL DEFAULT 'image';
