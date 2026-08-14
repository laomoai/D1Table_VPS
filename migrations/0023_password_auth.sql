-- Local/VPS password auth
ALTER TABLE _users ADD COLUMN password_hash TEXT;

CREATE TABLE IF NOT EXISTS _password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  token      TEXT    NOT NULL UNIQUE,
  user_id    INTEGER NOT NULL REFERENCES _users(id),
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_password_resets_token ON _password_resets(token);
