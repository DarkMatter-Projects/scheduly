ALTER TABLE posts
  ADD COLUMN caption_sentiment_score DECIMAL(6,3) NULL AFTER content,
  ADD COLUMN caption_sentiment_label ENUM('positive','neutral','negative') NULL AFTER caption_sentiment_score,
  ADD INDEX idx_posts_sentiment (caption_sentiment_label);
