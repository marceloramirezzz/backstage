CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT,
  google_id     TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
