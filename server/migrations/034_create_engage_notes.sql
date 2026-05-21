-- Internal notes attached to a thread. Not sent to the audience; only
-- visible inside scheduly, useful for handoff between teammates.
CREATE TABLE IF NOT EXISTS engage_notes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  thread_id   INT UNSIGNED NOT NULL,
  user_id     INT UNSIGNED NOT NULL,
  body        TEXT NOT NULL,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (thread_id) REFERENCES engage_threads(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_engage_notes_thread (thread_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
