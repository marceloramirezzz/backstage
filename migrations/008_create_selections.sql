CREATE TABLE selections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  -- Whole seconds, entered directly: not the sum of its Songs.
  duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
  intensity  song_intensity NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Lets Setlists require a Selection from their own Project.
  UNIQUE (project_id, id)
);

-- A Selection's Songs, in playing order. Only Songs can be referenced, so a
-- Selection can't contain another Selection.
CREATE TABLE selection_songs (
  project_id   UUID NOT NULL,
  selection_id UUID NOT NULL,
  -- 0-based playing order.
  position     INTEGER NOT NULL CHECK (position >= 0),
  song_id      UUID NOT NULL,
  PRIMARY KEY (selection_id, position),
  -- A Song plays at most once in a Selection.
  UNIQUE (selection_id, song_id),
  FOREIGN KEY (project_id, selection_id) REFERENCES selections (project_id, id) ON DELETE CASCADE,
  -- The Song must belong to the same Project. No cascade: a Song in a
  -- Selection can't be deleted.
  CONSTRAINT selection_songs_song FOREIGN KEY (project_id, song_id)
    REFERENCES songs (project_id, id)
);

-- Keeps the check that a deleted Song is in no Selection quick.
CREATE INDEX selection_songs_song_idx ON selection_songs (project_id, song_id);
