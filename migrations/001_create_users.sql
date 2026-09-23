CREATE TABLE users (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email             TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  display_name      TEXT NOT NULL CHECK (btrim(display_name) <> ''),
  password_hash     TEXT,
  google_id         TEXT UNIQUE,
  email_verified_at TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Every User must be able to log in somehow.
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);
