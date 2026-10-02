ALTER TABLE users
  ADD COLUMN theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('dark', 'light', 'system'));
