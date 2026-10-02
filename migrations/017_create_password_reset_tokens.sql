-- One live link per User: asking for a new one replaces it.
CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id    UUID NOT NULL UNIQUE REFERENCES users (id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
