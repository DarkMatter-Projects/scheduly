-- Lets a user "snooze until tomorrow" — the engage ingest job promotes the
-- thread back to 'open' once the snooze window expires.
ALTER TABLE engage_threads
  ADD COLUMN snooze_until DATETIME NULL AFTER status,
  ADD INDEX idx_engage_snooze (status, snooze_until);
