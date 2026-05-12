ALTER TABLE social_accounts
  ADD COLUMN client_id INT UNSIGNED NULL AFTER team_id,
  ADD CONSTRAINT fk_social_accounts_client
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL,
  ADD INDEX idx_social_accounts_client (client_id);
