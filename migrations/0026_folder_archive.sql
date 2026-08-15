ALTER TABLE _workspace_nodes ADD COLUMN archived_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_ws_archived ON _workspace_nodes(archived_at);
