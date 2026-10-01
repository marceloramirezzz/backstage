CREATE TYPE split_kind AS ENUM ('percentage', 'role_fixed', 'member_fixed');

-- The Project's default Payout Split: at most one rule per Role. `value` is
-- basis points (10 000 = 100%) for a percentage, whole Guaraníes for the
-- fixed kinds. A Role without a rule gets nothing.
CREATE TABLE project_split_rules (
  project_id UUID NOT NULL REFERENCES projects (id),
  role_id    UUID NOT NULL,
  kind       split_kind NOT NULL,
  value      BIGINT NOT NULL CHECK (value >= 0),
  PRIMARY KEY (project_id, role_id),
  FOREIGN KEY (project_id, role_id) REFERENCES roles (project_id, id) ON DELETE CASCADE,
  CHECK (kind <> 'percentage' OR value <= 10000)
);

-- An Event's own Split, replacing the default as a whole. The row marks the
-- override, so an override with no rules (nobody paid) differs from none.
CREATE TABLE event_splits (
  event_id   UUID PRIMARY KEY,
  project_id UUID NOT NULL,
  FOREIGN KEY (project_id, event_id) REFERENCES events (project_id, id) ON DELETE CASCADE,
  UNIQUE (project_id, event_id)
);

CREATE TABLE event_split_rules (
  event_id   UUID NOT NULL,
  project_id UUID NOT NULL,
  role_id    UUID NOT NULL,
  kind       split_kind NOT NULL,
  value      BIGINT NOT NULL CHECK (value >= 0),
  PRIMARY KEY (event_id, role_id),
  FOREIGN KEY (project_id, event_id) REFERENCES event_splits (project_id, event_id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, role_id) REFERENCES roles (project_id, id) ON DELETE CASCADE,
  CHECK (kind <> 'percentage' OR value <= 10000)
);
