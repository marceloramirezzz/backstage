-- The secret in a Project's calendar feed address. Whoever holds it can read
-- the feed, so an Admin regenerates it to cut off old subscribers.
ALTER TABLE projects
  ADD COLUMN calendar_token TEXT NOT NULL
    DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX projects_calendar_token_idx ON projects (calendar_token);
