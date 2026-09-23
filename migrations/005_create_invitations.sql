CREATE TABLE invitations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  role_id    UUID NOT NULL REFERENCES roles (id),
  email      TEXT NOT NULL CHECK (email = lower(email)),
  token      TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One pending invitation per email per Project.
CREATE UNIQUE INDEX invitations_one_pending_per_email
  ON invitations (project_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
