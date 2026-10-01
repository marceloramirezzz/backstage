CREATE TYPE song_intensity AS ENUM ('calm', 'medium', 'danceable', 'energetic');

CREATE TABLE songs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  -- Free text ("Dm", "G"); NULL while the band hasn't settled on one.
  key        TEXT CHECK (btrim(key) <> ''),
  -- Whole seconds.
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  intensity  song_intensity NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Lets Selections and Setlists require a Song from their own Project.
  UNIQUE (project_id, id)
);

-- Lets a Repertoire search ignore accents ("besame" finds "Bésame mucho").
CREATE EXTENSION IF NOT EXISTS unaccent;
