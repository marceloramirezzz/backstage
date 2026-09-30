CREATE TABLE memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  user_id    UUID NOT NULL REFERENCES users (id),
  role_id    UUID NOT NULL REFERENCES roles (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);

-- The Owner is always a Member of their Project. Deferred, because the
-- Project row has to exist before its Owner's Membership can.
ALTER TABLE projects
  ADD FOREIGN KEY (id, owner_id) REFERENCES memberships (project_id, user_id)
  DEFERRABLE INITIALLY DEFERRED;
