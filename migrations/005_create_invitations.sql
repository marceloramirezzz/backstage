CREATE TABLE invitations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  -- Null once the Role is deleted; only a pending Invitation blocks that.
  role_id    UUID,
  email      TEXT NOT NULL CHECK (email = lower(email)),
  -- SHA-256 of the emailed link's token, like sessions.
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at  TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The Role must belong to the same Project.
  FOREIGN KEY (project_id, role_id) REFERENCES roles (project_id, id)
    ON DELETE SET NULL (role_id)
);

-- One open (not accepted or revoked) Invitation per email per Project. An
-- expired one is revoked when a new one is sent.
CREATE UNIQUE INDEX invitations_one_pending_per_email
  ON invitations (project_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
