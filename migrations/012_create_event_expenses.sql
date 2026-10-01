-- A cost tied to one Event. Informational alongside the Event's pay; net pay
-- is pay minus the sum of these.
CREATE TABLE event_expenses (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  -- Whole Guaraníes.
  amount     BIGINT NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_expenses_event_idx ON event_expenses (event_id, created_at);
