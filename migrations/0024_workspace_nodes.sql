CREATE TABLE IF NOT EXISTS _workspace_nodes (
  id          TEXT PRIMARY KEY,
  kind        TEXT NOT NULL,
  parent_id   TEXT REFERENCES _workspace_nodes(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT NOT NULL DEFAULT '',
  ref         TEXT,
  group_id    INTEGER REFERENCES _groups(id),
  team_id     INTEGER REFERENCES _teams(id),
  owner_id    INTEGER REFERENCES _users(id),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_table_ref
  ON _workspace_nodes(team_id, ref) WHERE kind = 'table';
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_note_ref
  ON _workspace_nodes(team_id, ref) WHERE kind = 'note';
CREATE UNIQUE INDEX IF NOT EXISTS idx_ws_folder_group
  ON _workspace_nodes(group_id) WHERE kind = 'folder' AND group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ws_parent
  ON _workspace_nodes(team_id, parent_id, sort_order);

-- Folders from existing groups (roots)
INSERT INTO _workspace_nodes (id, kind, parent_id, sort_order, title, ref, group_id, team_id, owner_id)
SELECT
  'wn_g_' || id,
  'folder',
  NULL,
  sort_order,
  name,
  NULL,
  id,
  team_id,
  owner_id
FROM _groups;

-- Tables: first group by group sort_order, else root
INSERT INTO _workspace_nodes (id, kind, parent_id, sort_order, title, ref, team_id, owner_id)
SELECT
  'wn_t_' || m.table_name,
  'table',
  (
    SELECT 'wn_g_' || g.id
    FROM _group_tables gt
    JOIN _groups g ON g.id = gt.group_id
    WHERE gt.table_name = m.table_name
    ORDER BY g.sort_order ASC, g.id ASC
    LIMIT 1
  ),
  0,
  COALESCE(m.title, m.table_name),
  m.table_name,
  m.team_id,
  m.owner_id
FROM _meta m;

-- Root notes (not archived, not deleted)
INSERT INTO _workspace_nodes (id, kind, parent_id, sort_order, title, ref, team_id, owner_id)
SELECT
  'wn_n_' || n.id,
  'note',
  NULL,
  n.sort_order,
  n.title,
  n.id,
  n.team_id,
  n.owner_id
FROM _notes n
WHERE n.parent_id IS NULL
  AND n.deleted_at IS NULL
  AND n.archived_at IS NULL;
