-- Per-post tokenized approval link. Brand-side stakeholder (the client,
-- not a Scheduly user) gets a public URL like /approve/:token where
-- they can preview the post and approve / reject without a login.
--
-- One row per token. A post can have multiple tokens outstanding
-- (different reviewers). The decision + decided_at + reviewer_name
-- fields fill in when the link is used; expires_at lets us auto-revoke
-- stale links.
CREATE TABLE IF NOT EXISTS post_approval_tokens (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id         INT UNSIGNED NOT NULL,
  token           VARCHAR(64) NOT NULL UNIQUE,
  reviewer_name   VARCHAR(150) NULL,
  reviewer_email  VARCHAR(255) NULL,
  decision        ENUM('approved','rejected') NULL,
  decision_note   TEXT NULL,
  decided_at      DATETIME NULL,
  created_by      INT UNSIGNED NOT NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at      DATETIME NULL,
  FOREIGN KEY (post_id)    REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_post   (post_id),
  INDEX idx_token  (token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
