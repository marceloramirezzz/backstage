CREATE TABLE setlists (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id),
  name       TEXT NOT NULL CHECK (btrim(name) <> ''),
  -- Free text for the whole list ("cumbia", "boda"); NULL when there's none.
  category   TEXT CHECK (btrim(category) <> ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, id)
);

-- A Setlist's Songs and Selections, in playing order. Each item is exactly
-- one of the two, and the same one may come back later in the list.
CREATE TABLE setlist_items (
  project_id   UUID NOT NULL,
  setlist_id   UUID NOT NULL,
  -- 0-based playing order.
  position     INTEGER NOT NULL CHECK (position >= 0),
  song_id      UUID,
  selection_id UUID,
  PRIMARY KEY (setlist_id, position),
  CHECK (num_nonnulls(song_id, selection_id) = 1),
  FOREIGN KEY (project_id, setlist_id) REFERENCES setlists (project_id, id) ON DELETE CASCADE,
  -- From the same Project. No cascade: a Song or Selection in a Setlist
  -- can't be deleted.
  CONSTRAINT setlist_items_song FOREIGN KEY (project_id, song_id)
    REFERENCES songs (project_id, id),
  CONSTRAINT setlist_items_selection FOREIGN KEY (project_id, selection_id)
    REFERENCES selections (project_id, id)
);

-- Keep the checks that a deleted Song or Selection is in no Setlist quick.
CREATE INDEX setlist_items_song_idx ON setlist_items (project_id, song_id);
CREATE INDEX setlist_items_selection_idx ON setlist_items (project_id, selection_id);
