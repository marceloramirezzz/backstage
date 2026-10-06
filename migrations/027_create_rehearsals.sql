-- A lightweight calendar item: no pay, Setlist or Attendance, so it is not an
-- Event. Times are local clock times on `date`.
CREATE TABLE rehearsals (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  date       DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time   TIME NOT NULL CHECK (end_time > start_time),
  location   TEXT CHECK (btrim(location) <> ''),
  notes      TEXT CHECK (btrim(notes) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rehearsals_project_date_idx ON rehearsals (project_id, date);
