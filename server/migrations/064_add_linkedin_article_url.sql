-- LinkedIn /rest/posts supports an article content block — share a URL
-- as a link preview card. When this column is set the publisher
-- builds the article body instead of treating the post as text +
-- media. Document upload (PDF) is auto-detected from media mime type
-- so it doesn't need its own column.
ALTER TABLE posts
  ADD COLUMN linkedin_article_url VARCHAR(2048) NULL AFTER instagram_collaborators;
