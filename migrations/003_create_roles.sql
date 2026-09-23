CREATE TYPE role_kind AS ENUM ('admin', 'member', 'custom');

CREATE TABLE roles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  kind       role_kind NOT NULL,
  name       TEXT NOT NULL,
  can_edit_repertoire_setlists_events BOOLEAN,
  can_invite_remove_members           BOOLEAN,
  can_see_total_pay_expenses          BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, name),
  -- Permission flags only mean something for custom roles: NULL for
  -- admin/member, all three set for custom.
  CHECK (
    (kind = 'custom'
      AND can_edit_repertoire_setlists_events IS NOT NULL
      AND can_invite_remove_members IS NOT NULL
      AND can_see_total_pay_expenses IS NOT NULL)
    OR
    (kind <> 'custom'
      AND can_edit_repertoire_setlists_events IS NULL
      AND can_invite_remove_members IS NULL
      AND can_see_total_pay_expenses IS NULL)
  )
);
