-- Private provider credentials. No browser/Data API role may read these tables.
CREATE TABLE scheduly.tiktok_oauth_states (
  state_hash text PRIMARY KEY,
  user_id text NOT NULL,
  client_id text NOT NULL REFERENCES scheduly.clients(id),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE INDEX tiktok_oauth_states_user ON scheduly.tiktok_oauth_states(user_id);
CREATE TABLE scheduly.tiktok_grants (
  account_id text PRIMARY KEY REFERENCES scheduly.accounts(id),
  ciphertext text NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz NOT NULL,
  connected_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE scheduly.tiktok_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduly.tiktok_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scheduly.tiktok_oauth_states,scheduly.tiktok_grants FROM PUBLIC,anon,authenticated;

CREATE TABLE scheduly.tiktok_draft_uploads (
  id uuid PRIMARY KEY,
  account_id text NOT NULL REFERENCES scheduly.accounts(id),
  media_id uuid NOT NULL REFERENCES scheduly.media(id),
  created_by text NOT NULL,
  status text NOT NULL DEFAULT 'preparing',
  publish_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id,media_id)
);
ALTER TABLE scheduly.tiktok_draft_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scheduly.tiktok_draft_uploads FROM PUBLIC,anon,authenticated;
