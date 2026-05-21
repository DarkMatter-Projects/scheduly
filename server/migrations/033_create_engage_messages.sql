-- Individual messages inside an engage_thread. Both incoming (from the
-- audience) and outgoing (replies sent from scheduly) live here so the
-- conversation view is a simple chronological scan of one thread.
CREATE TABLE IF NOT EXISTS engage_messages (
  id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thread_id           INT UNSIGNED NOT NULL,
  -- Platform's own message/comment id. NULL for replies still in flight or
  -- where the platform doesn't return one synchronously.
  platform_message_id VARCHAR(255) NULL,
  -- Which way the message went.
  direction           ENUM('incoming','outgoing') NOT NULL,
  -- Author identity (the audience member for incoming, scheduly user's
  -- linked social profile for outgoing).
  author_id           VARCHAR(255) NULL,
  author_handle       VARCHAR(255) NULL,
  author_name         VARCHAR(255) NULL,
  author_avatar_url   VARCHAR(500) NULL,
  body                TEXT NOT NULL,
  sentiment           ENUM('positive','neutral','negative') NULL,
  sent_at             DATETIME NOT NULL,
  -- Who in scheduly composed the outgoing reply (NULL for incoming).
  sent_by_user_id     INT UNSIGNED NULL,
  is_read             TINYINT(1) NOT NULL DEFAULT 0,
  -- When a reply fails (e.g. token expired) we store the platform error here.
  error_message       VARCHAR(500) NULL,
  created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES engage_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (sent_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  -- platform_message_id is unique within a thread when set; allows the same
  -- (NULL) value for multiple pending outgoing messages.
  UNIQUE KEY uq_engage_message (thread_id, platform_message_id),
  INDEX idx_engage_messages_thread (thread_id, sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
