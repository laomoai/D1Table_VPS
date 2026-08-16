CREATE TABLE IF NOT EXISTS _files (
  storage_key TEXT PRIMARY KEY,
  owner_id INTEGER,
  team_id INTEGER,
  ref_kind TEXT NOT NULL DEFAULT 'none',
  ref_id TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_files_ref ON _files (ref_kind, ref_id);
CREATE INDEX IF NOT EXISTS idx_files_team ON _files (team_id);
