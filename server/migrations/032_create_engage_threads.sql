-- A "thread" is a conversation surface in the unified inbox: a DM
-- conversation with a single person, or all comments on a single post.
-- Replies and incoming items both attach to engage_messages.
CREATE TABLE IF NOT EXISTS engage_threads (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  platform            ENUM('facebook_page','instagram_business','tiktok') NOT NULL,
  -- comment: thread = all comments on a single post by a single participant.
  -- dm:      thread = a DM conversation with a single platform user.
  -- mention: thread = a single mention event (one item, no back-and-forth).
  source_type         ENUM('comment','dm','mention') NOT NULL,
  -- Our connected account that received the incoming items.
  social_account_id   INT UNSIGNED NOT NULL,
  -- For comment threads, link back to our post when we own it.
  post_target_id      INT UNSIGNED NULL,
  -- The platform's id for the post the comment is on (also used for DM thread keys).
  platform_post_id    VARCHAR(255) NULL,
  -- The "other side" of the conversation.
  participant_id      VARCHAR(255) NOT NULL,
  participant_handle  VARCHAR(255) NULL,
  participant_name    VARCHAR(255) NULL,
  participant_avatar_url VARCHAR(500) NULL,
  -- Aggregation columns: cached for list views so we don't have to scan messages.
  last_message_at     DATETIME NOT NULL,
  last_message_preview VARCHAR(500) NULL,
  unread_count        INT UNSIGNED NOT NULL DEFAULT 0,
  status              ENUM('open','closed','snoozed') NOT NULL DEFAULT 'open',
  -- Aggregate sentiment of the latest incoming message (for the feed tags).
  sentiment           ENUM('positive','neutral','negative') NULL,
  -- Workflow state.
  assigned_to         INT UNSIGNED NULL,
  client_id           INT UNSIGNED NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (social_account_id) REFERENCES social_accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (post_target_id) REFERENCES post_targets(id) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  -- A unique thread per (platform, type, account, participant, post). Comments
  -- on the same post by the same person merge into one thread; DMs with the
  -- same person reuse the existing DM thread.
  UNIQUE KEY uq_engage_thread (platform, source_type, social_account_id, participant_id, platform_post_id),
  INDEX idx_engage_status_recent (status, last_message_at),
  INDEX idx_engage_unread (status, unread_count, last_message_at),
  INDEX idx_engage_assigned (assigned_to, status, last_message_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
