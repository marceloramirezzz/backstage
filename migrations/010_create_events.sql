CREATE TYPE event_status AS ENUM ('pending', 'confirmed', 'paid', 'cancelled');

CREATE TABLE events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  date       DATE NOT NULL,
  -- Local clock time the gig starts; NULL while it isn't settled.
  start_time TIME,
  location   TEXT CHECK (btrim(location) <> ''),
  -- Cachet, whole Guaraníes.
  pay        BIGINT NOT NULL DEFAULT 0 CHECK (pay >= 0),
  -- The whole gig, breaks and sound check included: independent of the
  -- Setlist's total.
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  -- Moves freely between all four.
  status     event_status NOT NULL DEFAULT 'pending',
  is_public  BOOLEAN NOT NULL DEFAULT false,
  -- The template this Event's Setlist was copied from, as it was then. Plain
  -- values, not a reference: the template can change or go.
  setlist_name     TEXT,
  setlist_category TEXT,
  setlist_copied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);

CREATE INDEX events_project_date_idx ON events (project_id, date);

-- The Event's own copy of its Setlist, in playing order. Values, not
-- references to Songs or Selections: editing or deleting those never touches
-- a past Event.
CREATE TABLE event_setlist_items (
  event_id   UUID NOT NULL REFERENCES events (id) ON DELETE CASCADE,
  position   INTEGER NOT NULL CHECK (position >= 0),
  kind       TEXT NOT NULL CHECK (kind IN ('song', 'selection')),
  name       TEXT NOT NULL,
  key        TEXT,
  duration_seconds INTEGER NOT NULL,
  intensity  song_intensity NOT NULL,
  -- For a Selection, its Songs as they were when copied.
  songs      JSONB,
  PRIMARY KEY (event_id, position)
);
