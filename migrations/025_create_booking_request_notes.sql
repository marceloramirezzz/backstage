-- Internal notes on a Booking Request, never shown to the client. The author
-- is kept by name so a note outlives the account that wrote it.
CREATE TABLE booking_request_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id  UUID NOT NULL REFERENCES booking_requests (id) ON DELETE CASCADE,
  author_id   UUID REFERENCES users (id) ON DELETE SET NULL,
  author_name TEXT NOT NULL CHECK (btrim(author_name) <> ''),
  body        TEXT NOT NULL CHECK (btrim(body) <> ''),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX booking_request_notes_request_idx ON booking_request_notes (request_id, created_at);
