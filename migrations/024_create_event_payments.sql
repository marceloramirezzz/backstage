-- Money received from the client toward one Event (a deposit, an installment).
-- Informational: it never changes the Event's status.
CREATE TABLE event_payments (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id   UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  -- The day the money arrived.
  date       DATE NOT NULL,
  -- Whole Guaraníes.
  amount     BIGINT NOT NULL CHECK (amount > 0),
  note       TEXT CHECK (btrim(note) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX event_payments_event_idx ON event_payments (event_id, date, created_at);
CREATE INDEX event_payments_date_idx ON event_payments (date);
