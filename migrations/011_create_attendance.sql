-- Attendance stores who did NOT play: every Member of the Project is
-- attending an Event unless listed here, so a new Event (or a Member who
-- joins later) starts as attending with nothing to write.
CREATE TABLE event_absences (
  event_id   UUID NOT NULL,
  project_id UUID NOT NULL,
  user_id    UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id),
  FOREIGN KEY (project_id, event_id) REFERENCES events (project_id, id) ON DELETE CASCADE,
  -- Leaving the Project clears it, so rejoining starts as attending.
  FOREIGN KEY (project_id, user_id) REFERENCES memberships (project_id, user_id) ON DELETE CASCADE
);

-- A name-only person added to one Event's Attendance. Not a User: no login.
CREATE TABLE event_guests (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  -- Fixed amount for this Event only, whole Guaraníes.
  amount     BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_guests_event_idx ON event_guests (event_id, created_at);
