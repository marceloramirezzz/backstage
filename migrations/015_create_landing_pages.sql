-- A Project's public Landing page. A row exists once an Admin has chosen an
-- address; no row (or enabled = false) means nothing is published. Off by
-- default.
CREATE TABLE landing_pages (
  project_id UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  -- The address under `/`, lowercase.
  slug       TEXT NOT NULL CONSTRAINT landing_pages_slug_unique UNIQUE
             CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  enabled    BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
