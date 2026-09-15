-- Private YouTube verification uploads. These records let the server resume or
-- inspect an interrupted transfer without ever exposing provider data via the API.
CREATE TABLE scheduly.youtube_private_uploads (
  id uuid PRIMARY KEY,
  account_id text NOT NULL REFERENCES scheduly.accounts(id),
  media_id uuid NOT NULL REFERENCES scheduly.media(id),
  created_by text NOT NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN ('preparing','uploading','private_uploaded','needs_attention')),
  video_id text,
  resume_ciphertext text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, media_id)
);
ALTER TABLE scheduly.youtube_private_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scheduly.youtube_private_uploads FROM PUBLIC,anon,authenticated;
