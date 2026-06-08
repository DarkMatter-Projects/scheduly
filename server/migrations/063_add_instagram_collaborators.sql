-- IG Graph API container creation accepts `collaborators` — an array of
-- IG usernames to invite as collaborators on the post. They get a
-- notification and the post shows up on their profile once accepted.
-- Stored as JSON because it's a small array and we'd never query it.
ALTER TABLE posts
  ADD COLUMN instagram_collaborators JSON NULL AFTER instagram_first_comment;
