-- A Project's Landing page album: a flat, ordered list of photos, each with
-- an optional caption. Edits are live; there is no draft.
CREATE TABLE landing_photos (
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  -- 0-based display order.
  position   INTEGER NOT NULL CHECK (position >= 0),
  url        TEXT NOT NULL CHECK (url ~ '^https://'),
  caption    TEXT CHECK (btrim(caption) <> ''),
  PRIMARY KEY (project_id, position)
);

-- Contact links: a preset platform with a value, or 'other' with a free-text
-- label. Displayed in the order set.
CREATE TABLE landing_contacts (
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  position   INTEGER NOT NULL CHECK (position >= 0),
  platform   TEXT NOT NULL CHECK (platform IN
             ('instagram', 'facebook', 'whatsapp', 'email', 'phone', 'tiktok', 'youtube', 'spotify', 'website', 'other')),
  -- Only for 'other'.
  label      TEXT CHECK (btrim(label) <> ''),
  value      TEXT NOT NULL CHECK (btrim(value) <> ''),
  PRIMARY KEY (project_id, position),
  CHECK ((platform = 'other') = (label IS NOT NULL))
);
