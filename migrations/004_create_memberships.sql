CREATE TYPE membership_status AS ENUM ('invited', 'active');

CREATE TABLE memberships (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  user_id    UUID NOT NULL REFERENCES users (id),
  role_id    UUID NOT NULL REFERENCES roles (id),
  status     membership_status NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, user_id)
);
