CREATE TABLE invitations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  -- Null once the Role is deleted; only a pending Invitation blocks that.
  role_id    UUID,
  email      TEXT NOT NULL CHECK (email = lower(email)),
  token      TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The Role must belong to the same Project.
  FOREIGN KEY (project_id, role_id) REFERENCES roles (project_id, id)
    ON DELETE SET NULL (role_id)
);

-- One pending invitation per email per Project.
CREATE UNIQUE INDEX invitations_one_pending_per_email
  ON invitations (project_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
