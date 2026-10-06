CREATE TYPE document_type AS ENUM ('quote', 'contract', 'invoice');

-- The last number given out per Project and type. Numbers are never reused,
-- even when the source of a Document is deleted.
CREATE TABLE document_sequences (
  project_id  UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  type        document_type NOT NULL,
  last_number INTEGER NOT NULL,
  PRIMARY KEY (project_id, type)
);

-- The number a Document got the first time it was generated for its source.
-- The PDF itself is never stored; this only lets a regeneration keep its number.
CREATE TABLE documents (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  type               document_type NOT NULL,
  number             INTEGER NOT NULL CHECK (number > 0),
  booking_request_id UUID REFERENCES booking_requests (id) ON DELETE CASCADE,
  event_id           UUID REFERENCES events (id) ON DELETE CASCADE,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((booking_request_id IS NOT NULL) <> (event_id IS NOT NULL)),
  UNIQUE (project_id, type, number)
);

CREATE UNIQUE INDEX documents_request_idx ON documents (type, booking_request_id) WHERE booking_request_id IS NOT NULL;
CREATE UNIQUE INDEX documents_event_idx ON documents (type, event_id) WHERE event_id IS NOT NULL;
