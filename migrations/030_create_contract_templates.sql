-- A Project's edited contract template. No row means the default is in use.
CREATE TABLE contract_templates (
  project_id UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  body       TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 10000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
