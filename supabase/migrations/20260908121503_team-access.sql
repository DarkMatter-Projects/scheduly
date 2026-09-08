CREATE TABLE IF NOT EXISTS scheduly.team_members (
 email text PRIMARY KEY CHECK (email=lower(email)),
 user_id text UNIQUE,
 role text NOT NULL CHECK(role IN ('admin','editor','content_creator','viewer')),
 active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1,
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scheduly.team_client_access (
 email text REFERENCES scheduly.team_members(email) ON DELETE CASCADE,
 client_id text REFERENCES scheduly.clients(id),
 PRIMARY KEY(email,client_id)
);
CREATE TABLE IF NOT EXISTS scheduly.team_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor text NOT NULL, email text NOT NULL, details jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE scheduly.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduly.team_client_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduly.team_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON scheduly.team_members,scheduly.team_client_access,scheduly.team_audit FROM PUBLIC;
REVOKE ALL ON scheduly.team_members,scheduly.team_client_access,scheduly.team_audit FROM anon,authenticated;
REVOKE ALL ON SEQUENCE scheduly.team_audit_id_seq FROM PUBLIC,anon,authenticated;
-- Jason is the explicitly authorised initial Admin. Resolve the verified ID at rollout.
INSERT INTO scheduly.team_members(email,user_id,role)
SELECT lower(email),id::text,'admin' FROM auth.users
WHERE lower(email)='jason@darkm.co.za' AND email_confirmed_at IS NOT NULL
ON CONFLICT(email) DO NOTHING;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM scheduly.team_members WHERE role='admin' AND active AND user_id IS NOT NULL) THEN
  RAISE EXCEPTION 'Provision a verified initial Admin before deploying team enforcement';
 END IF;
END $$;
