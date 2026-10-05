-- Per-Member payout rules (ADR 0003). A Member is on an Equal share unless a
-- row says Fixed. The Role-based tables (project_split_rules, event_splits,
-- event_split_rules) stay for now, no longer read by the split.
CREATE TYPE member_rule_kind AS ENUM ('equal', 'fixed');

-- A Member's default rule in the Project. No row means Equal share.
CREATE TABLE member_split_defaults (
  project_id UUID NOT NULL,
  user_id    UUID NOT NULL,
  kind       member_rule_kind NOT NULL,
  -- Whole Guaraníes for a fixed rule; 0 for an equal share.
  value      BIGINT NOT NULL DEFAULT 0 CHECK (value >= 0),
  PRIMARY KEY (project_id, user_id),
  FOREIGN KEY (project_id, user_id) REFERENCES memberships (project_id, user_id) ON DELETE CASCADE,
  CHECK (kind = 'fixed' OR value = 0)
);

-- A Member's per-Event settings: an optional rule replacing their default
-- (null kind = follow the default) and a signed Ajuste added to their share.
CREATE TABLE event_member_settings (
  event_id   UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id    UUID NOT NULL,
  rule_kind  member_rule_kind,
  rule_value BIGINT NOT NULL DEFAULT 0 CHECK (rule_value >= 0),
  ajuste     BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (event_id, user_id),
  FOREIGN KEY (project_id, event_id) REFERENCES events (project_id, id) ON DELETE CASCADE,
  FOREIGN KEY (project_id, user_id) REFERENCES memberships (project_id, user_id) ON DELETE CASCADE,
  CHECK (rule_kind = 'fixed' OR rule_value = 0)
);

-- Convert the Role-based rules: a Role's fixed-per-Member rule becomes a fixed
-- rule for each Member holding it; every other Role rule is an Equal share,
-- which is the default and needs no row. Paid snapshots are not touched.
INSERT INTO member_split_defaults (project_id, user_id, kind, value)
SELECT m.project_id, m.user_id, 'fixed', r.value
FROM project_split_rules r
JOIN memberships m ON m.project_id = r.project_id AND m.role_id = r.role_id
WHERE r.kind = 'member_fixed';

-- An Event's own Split replaced the default as a whole, so each Member of an
-- overriding Event gets an explicit rule: fixed for a member_fixed Role,
-- Equal share otherwise.
INSERT INTO event_member_settings (event_id, project_id, user_id, rule_kind, rule_value)
SELECT s.event_id, s.project_id, m.user_id,
  CASE WHEN r.kind = 'member_fixed' THEN 'fixed'::member_rule_kind ELSE 'equal'::member_rule_kind END,
  CASE WHEN r.kind = 'member_fixed' THEN r.value ELSE 0 END
FROM event_splits s
JOIN memberships m ON m.project_id = s.project_id
LEFT JOIN event_split_rules r ON r.event_id = s.event_id AND r.role_id = m.role_id;
