CREATE TABLE IF NOT EXISTS _assistant_threads (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  team_id INTEGER,
  title TEXT NOT NULL DEFAULT '对话',
  summary TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_assistant_threads_user ON _assistant_threads (user_id);

CREATE TABLE IF NOT EXISTS _assistant_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  draft_json TEXT,
  steps_json TEXT,
  topic TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_assistant_messages_thread ON _assistant_messages (thread_id, created_at);
