-- Provider connection state and grants are private to the server gateway.
CREATE TABLE scheduly.provider_oauth_states (
  provider text NOT NULL CHECK (provider IN ('meta','youtube')),
  state_hash text PRIMARY KEY,
  user_id text NOT NULL,
  client_id text NOT NULL REFERENCES scheduly.clients(id),
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE INDEX provider_oauth_states_user ON scheduly.provider_oauth_states(user_id);

CREATE TABLE scheduly.provider_connection_sessions (
  id uuid PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('meta','youtube')),
  user_id text NOT NULL,
  client_id text NOT NULL REFERENCES scheduly.clients(id),
  ciphertext text NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);

CREATE TABLE scheduly.provider_grants (
  provider text NOT NULL CHECK (provider IN ('meta','youtube')),
  account_id text PRIMARY KEY REFERENCES scheduly.accounts(id),
  ciphertext text NOT NULL,
  scopes text[] NOT NULL,
  expires_at timestamptz,
  connected_by text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE scheduly.provider_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduly.provider_connection_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduly.provider_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scheduly.provider_oauth_states,scheduly.provider_connection_sessions,scheduly.provider_grants FROM PUBLIC,anon,authenticated;
