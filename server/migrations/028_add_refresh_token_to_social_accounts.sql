-- TikTok and some other platforms issue a short-lived access token plus a
-- long-lived refresh token. Existing IG/FB rows leave these NULL.
ALTER TABLE social_accounts
  ADD COLUMN refresh_token TEXT NULL AFTER access_token,
  ADD COLUMN refresh_token_expires_at DATETIME NULL AFTER token_expires_at;
