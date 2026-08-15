ALTER TABLE _meta ADD COLUMN archived_at INTEGER;
CREATE INDEX IF NOT EXISTS idx_meta_archived ON _meta(archived_at);
