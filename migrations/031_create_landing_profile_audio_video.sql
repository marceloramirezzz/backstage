-- The Landing page's hero, services and about text. Kept apart from
-- landing_pages so an Admin can fill it in before choosing an address.
-- Every field is optional; a row with nothing set is the same as no row.
CREATE TABLE landing_profiles (
  project_id   UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  tagline      TEXT CHECK (btrim(tagline) <> ''),
  genre        TEXT CHECK (btrim(genre) <> ''),
  -- Ids from the fixed list in src/lib/landing-services.ts.
  services     TEXT[] NOT NULL DEFAULT '{}',
  years_active INTEGER CHECK (years_active BETWEEN 0 AND 100),
  travel_area  TEXT CHECK (btrim(travel_area) <> ''),
  about        TEXT CHECK (btrim(about) <> '')
);

-- Audio sample links: any https address, with an optional title.
CREATE TABLE landing_audio (
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  position   INTEGER NOT NULL CHECK (position >= 0),
  url        TEXT NOT NULL CHECK (url ~ '^https://'),
  title      TEXT CHECK (btrim(title) <> ''),
  PRIMARY KEY (project_id, position)
);

-- Videos: YouTube or Vimeo links, shown as embeds.
CREATE TABLE landing_videos (
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  position   INTEGER NOT NULL CHECK (position >= 0),
  url        TEXT NOT NULL CHECK (url ~ '^https://'),
  title      TEXT CHECK (btrim(title) <> ''),
  PRIMARY KEY (project_id, position)
);
