import type { SqliteDatabase } from '../db/sqlite'

export type WorkspaceKind = 'folder' | 'table' | 'note'

export type WorkspaceNode = {
  id: string
  kind: WorkspaceKind
  parent_id: string | null
  sort_order: number
  title: string
  ref: string | null
  group_id: number | null
  team_id: number | null
  icon: string | null
}

export function newWorkspaceId(kind: WorkspaceKind): string {
  const rand = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
  return `wn_${kind[0]}_${rand}`
}

async function nextSort(db: SqliteDatabase, teamId: number | undefined, parentId: string | null): Promise<number> {
  const row = parentId
    ? await db.prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS m FROM _workspace_nodes WHERE parent_id = ? AND (? IS NULL OR team_id = ?)`,
      ).bind(parentId, teamId ?? null, teamId ?? null).first<{ m: number }>()
    : teamId !== undefined
      ? await db.prepare(
          `SELECT COALESCE(MAX(sort_order), -1) AS m FROM _workspace_nodes WHERE parent_id IS NULL AND team_id = ?`,
        ).bind(teamId).first<{ m: number }>()
      : await db.prepare(
          `SELECT COALESCE(MAX(sort_order), -1) AS m FROM _workspace_nodes WHERE parent_id IS NULL`,
        ).first<{ m: number }>()
  return (row?.m ?? -1) + 1
}

export async function getNode(db: SqliteDatabase, id: string): Promise<WorkspaceNode | null> {
  return db.prepare(
    `SELECT id, kind, parent_id, sort_order, title, ref, group_id, team_id, NULL as icon
     FROM _workspace_nodes WHERE id = ?`,
  ).bind(id).first<WorkspaceNode>()
}

export async function assertFolder(
  db: SqliteDatabase,
  folderId: string | null | undefined,
  teamId: number | undefined,
): Promise<WorkspaceNode | null> {
  if (!folderId) return null
  const node = await getNode(db, folderId)
  if (!node || node.kind !== 'folder') {
    throw Object.assign(new Error('Parent must be a folder'), { status: 400, code: 'INVALID_PARENT' })
  }
  if (teamId !== undefined && node.team_id !== teamId) {
    throw Object.assign(new Error('Folder not found'), { status: 404, code: 'NOT_FOUND' })
  }
  return node
}

export async function ensureFolderForGroup(
  db: SqliteDatabase,
  opts: { groupId: number; title: string; teamId?: number; ownerId?: number | null },
): Promise<WorkspaceNode> {
  const existing = await db.prepare(
    `SELECT id, kind, parent_id, sort_order, title, ref, group_id, team_id FROM _workspace_nodes WHERE kind = 'folder' AND group_id = ?`,
  ).bind(opts.groupId).first<WorkspaceNode>()
  if (existing) return { ...existing, icon: null }

  const id = newWorkspaceId('folder')
  const sort = await nextSort(db, opts.teamId, null)
  await db.prepare(
    `INSERT INTO _workspace_nodes (id, kind, parent_id, sort_order, title, ref, group_id, team_id, owner_id)
     VALUES (?, 'folder', NULL, ?, ?, NULL, ?, ?, ?)`,
  ).bind(id, sort, opts.title, opts.groupId, opts.teamId ?? null, opts.ownerId ?? null).run()
  return {
    id, kind: 'folder', parent_id: null, sort_order: sort,
    title: opts.title, ref: null, group_id: opts.groupId, team_id: opts.teamId ?? null, icon: null,
  }
}

export async function syncFolderTitleByGroup(db: SqliteDatabase, groupId: number, title: string): Promise<void> {
  await db.prepare(
    `UPDATE _workspace_nodes SET title = ?, updated_at = unixepoch() WHERE kind = 'folder' AND group_id = ?`,
  ).bind(title, groupId).run()
}

export async function removeFolderByGroup(db: SqliteDatabase, groupId: number): Promise<void> {
  const folder = await db.prepare(
    `SELECT id FROM _workspace_nodes WHERE kind = 'folder' AND group_id = ?`,
  ).bind(groupId).first<{ id: string }>()
  if (!folder) return
  await db.batch([
    db.prepare(`UPDATE _workspace_nodes SET parent_id = NULL, updated_at = unixepoch() WHERE parent_id = ?`).bind(folder.id),
    db.prepare(`DELETE FROM _workspace_nodes WHERE id = ?`).bind(folder.id),
  ])
}

export async function attachTablesToGroupFolder(
  db: SqliteDatabase,
  groupId: number,
  tableNames: string[],
): Promise<void> {
  const folder = await db.prepare(
    `SELECT id FROM _workspace_nodes WHERE kind = 'folder' AND group_id = ?`,
  ).bind(groupId).first<{ id: string }>()
  if (!folder) return

  const selected = new Set(tableNames)
  const current = await db.prepare(
    `SELECT id, ref FROM _workspace_nodes WHERE kind = 'table' AND parent_id = ?`,
  ).bind(folder.id).all<{ id: string; ref: string | null }>()

  for (const name of tableNames) {
    await db.prepare(
      `UPDATE _workspace_nodes SET parent_id = ?, updated_at = unixepoch() WHERE kind = 'table' AND ref = ?`,
    ).bind(folder.id, name).run()
  }
  for (const row of current.results) {
    if (row.ref && !selected.has(row.ref)) {
      await db.prepare(
        `UPDATE _workspace_nodes SET parent_id = NULL, updated_at = unixepoch() WHERE id = ?`,
      ).bind(row.id).run()
    }
  }
}

export async function backfillTableFolderParents(db: SqliteDatabase, teamId?: number): Promise<void> {
  const sql = teamId !== undefined
    ? `SELECT t.id AS node_id, (
         SELECT n.id FROM _group_tables gt
         JOIN _workspace_nodes n ON n.kind = 'folder' AND n.group_id = gt.group_id
         JOIN _groups g ON g.id = gt.group_id
         WHERE gt.table_name = t.ref
         ORDER BY g.sort_order ASC, g.id ASC
         LIMIT 1
       ) AS folder_id
       FROM _workspace_nodes t
       WHERE t.kind = 'table' AND t.parent_id IS NULL AND t.team_id = ?`
    : `SELECT t.id AS node_id, (
         SELECT n.id FROM _group_tables gt
         JOIN _workspace_nodes n ON n.kind = 'folder' AND n.group_id = gt.group_id
         JOIN _groups g ON g.id = gt.group_id
         WHERE gt.table_name = t.ref
         ORDER BY g.sort_order ASC, g.id ASC
         LIMIT 1
       ) AS folder_id
       FROM _workspace_nodes t
       WHERE t.kind = 'table' AND t.parent_id IS NULL`

  const rows = teamId !== undefined
    ? await db.prepare(sql).bind(teamId).all<{ node_id: string; folder_id: string | null }>()
    : await db.prepare(sql).all<{ node_id: string; folder_id: string | null }>()

  for (const row of rows.results) {
    if (!row.folder_id) continue
    await db.prepare(
      `UPDATE _workspace_nodes SET parent_id = ?, updated_at = unixepoch() WHERE id = ?`,
    ).bind(row.folder_id, row.node_id).run()
  }
}

export async function backfillMissingGroupFolders(db: SqliteDatabase, teamId?: number): Promise<void> {
  const sql = teamId !== undefined
    ? `SELECT g.id, g.name, g.team_id, g.owner_id FROM _groups g
       WHERE g.team_id = ? AND NOT EXISTS (
         SELECT 1 FROM _workspace_nodes n WHERE n.kind = 'folder' AND n.group_id = g.id
       )`
    : `SELECT g.id, g.name, g.team_id, g.owner_id FROM _groups g
       WHERE NOT EXISTS (
         SELECT 1 FROM _workspace_nodes n WHERE n.kind = 'folder' AND n.group_id = g.id
       )`
  const rows = teamId !== undefined
    ? await db.prepare(sql).bind(teamId).all<{ id: number; name: string; team_id: number | null; owner_id: number | null }>()
    : await db.prepare(sql).all<{ id: number; name: string; team_id: number | null; owner_id: number | null }>()
  for (const g of rows.results) {
    await ensureFolderForGroup(db, {
      groupId: g.id,
      title: g.name,
      teamId: g.team_id ?? undefined,
      ownerId: g.owner_id,
    })
  }
}

export async function createFolder(
  db: SqliteDatabase,
  opts: { title: string; parentId?: string | null; teamId?: number; ownerId?: number | null },
): Promise<WorkspaceNode> {
  const parent = await assertFolder(db, opts.parentId, opts.teamId)
  const title = opts.title.trim()
  if (!title) {
    throw Object.assign(new Error('Folder name cannot be empty'), { status: 400, code: 'INVALID_BODY' })
  }

  const groupResult = await db.prepare(
    `INSERT INTO _groups (name, sort_order, owner_id, team_id) VALUES (?, ?, ?, ?)`,
  ).bind(title, 0, opts.ownerId ?? null, opts.teamId ?? null).run()
  const groupId = Number(groupResult.meta.last_row_id)
  const id = newWorkspaceId('folder')
  const sort = await nextSort(db, opts.teamId, parent?.id ?? null)
  await db.prepare(
    `INSERT INTO _workspace_nodes (id, kind, parent_id, sort_order, title, ref, group_id, team_id, owner_id)
     VALUES (?, 'folder', ?, ?, ?, NULL, ?, ?, ?)`,
  ).bind(id, parent?.id ?? null, sort, title, groupId, opts.teamId ?? null, opts.ownerId ?? null).run()

  return {
    id, kind: 'folder', parent_id: parent?.id ?? null, sort_order: sort,
    title, ref: null, group_id: groupId, team_id: opts.teamId ?? null, icon: null,
  }
}

export async function renameFolder(db: SqliteDatabase, id: string, title: string, teamId?: number): Promise<void> {
  const node = await getNode(db, id)
  if (!node || node.kind !== 'folder') {
    throw Object.assign(new Error('Folder not found'), { status: 404, code: 'NOT_FOUND' })
  }
  if (teamId !== undefined && node.team_id !== teamId) {
    throw Object.assign(new Error('Folder not found'), { status: 404, code: 'NOT_FOUND' })
  }
  const name = title.trim()
  if (!name) {
    throw Object.assign(new Error('Folder name cannot be empty'), { status: 400, code: 'INVALID_BODY' })
  }
  await db.batch([
    db.prepare(`UPDATE _workspace_nodes SET title = ?, updated_at = unixepoch() WHERE id = ?`).bind(name, id),
    ...(node.group_id
      ? [db.prepare(`UPDATE _groups SET name = ? WHERE id = ?`).bind(name, node.group_id)]
      : []),
  ])
}

export async function deleteEmptyFolder(db: SqliteDatabase, id: string, teamId?: number): Promise<void> {
  const node = await getNode(db, id)
  if (!node || node.kind !== 'folder') {
    throw Object.assign(new Error('Folder not found'), { status: 404, code: 'NOT_FOUND' })
  }
  if (teamId !== undefined && node.team_id !== teamId) {
    throw Object.assign(new Error('Folder not found'), { status: 404, code: 'NOT_FOUND' })
  }
  const child = await db.prepare(
    `SELECT id FROM _workspace_nodes WHERE parent_id = ? LIMIT 1`,
  ).bind(id).first()
  if (child) {
    throw Object.assign(new Error('Folder is not empty'), { status: 409, code: 'NOT_EMPTY' })
  }
  await db.batch([
    db.prepare(`DELETE FROM _workspace_nodes WHERE id = ?`).bind(id),
    ...(node.group_id
      ? [db.prepare(`DELETE FROM _groups WHERE id = ?`).bind(node.group_id)]
      : []),
  ])
}

async function isDescendant(db: SqliteDatabase, ancestorId: string, maybeChildId: string): Promise<boolean> {
  let current: string | null = maybeChildId
  const seen = new Set<string>()
  while (current) {
    if (current === ancestorId) return true
    if (seen.has(current)) break
    seen.add(current)
    const row = await db.prepare(`SELECT parent_id FROM _workspace_nodes WHERE id = ?`).bind(current).first<{ parent_id: string | null }>()
    current = row?.parent_id ?? null
  }
  return false
}

export async function moveNode(
  db: SqliteDatabase,
  opts: { id: string; parentId: string | null; sortOrder?: number; teamId?: number },
): Promise<void> {
  const node = await getNode(db, opts.id)
  if (!node) {
    throw Object.assign(new Error('Node not found'), { status: 404, code: 'NOT_FOUND' })
  }
  if (opts.teamId !== undefined && node.team_id !== opts.teamId) {
    throw Object.assign(new Error('Node not found'), { status: 404, code: 'NOT_FOUND' })
  }

  const parent = await assertFolder(db, opts.parentId, opts.teamId)
  const newParentId = parent?.id ?? null
  if (newParentId === node.id) {
    throw Object.assign(new Error('Cannot move a folder into itself'), { status: 400, code: 'INVALID_PARENT' })
  }
  if (node.kind === 'folder' && newParentId && await isDescendant(db, node.id, newParentId)) {
    throw Object.assign(new Error('Cannot move a folder into its descendant'), { status: 400, code: 'INVALID_PARENT' })
  }

  const sort = opts.sortOrder ?? await nextSort(db, opts.teamId, newParentId)
  const stmts = [
    db.prepare(
      `UPDATE _workspace_nodes SET parent_id = ?, sort_order = ?, updated_at = unixepoch() WHERE id = ?`,
    ).bind(newParentId, sort, node.id),
  ]

  if (node.kind === 'table' && node.ref) {
    const oldFolder = node.parent_id ? await getNode(db, node.parent_id) : null
    if (oldFolder?.group_id) {
      stmts.push(
        db.prepare(`DELETE FROM _group_tables WHERE group_id = ? AND table_name = ?`).bind(oldFolder.group_id, node.ref),
      )
    }
    if (parent?.group_id) {
      stmts.push(
        db.prepare(`INSERT OR IGNORE INTO _group_tables (group_id, table_name) VALUES (?, ?)`).bind(parent.group_id, node.ref),
      )
    }
  }

  await db.batch(stmts)
}

export async function ensureTableNode(
  db: SqliteDatabase,
  opts: { tableName: string; title: string; folderId?: string | null; teamId?: number; ownerId?: number | null },
): Promise<void> {
  const existing = await db.prepare(
    `SELECT id FROM _workspace_nodes WHERE kind = 'table' AND ref = ?`,
  ).bind(opts.tableName).first()
  if (existing) return

  const parent = await assertFolder(db, opts.folderId, opts.teamId)
  const sort = await nextSort(db, opts.teamId, parent?.id ?? null)
  const stmts = [
    db.prepare(
      `INSERT INTO _workspace_nodes (id, kind, parent_id, sort_order, title, ref, team_id, owner_id)
       VALUES (?, 'table', ?, ?, ?, ?, ?, ?)`,
    ).bind(
      `wn_t_${opts.tableName}`,
      parent?.id ?? null,
      sort,
      opts.title,
      opts.tableName,
      opts.teamId ?? null,
      opts.ownerId ?? null,
    ),
  ]
  if (parent?.group_id) {
    stmts.push(
      db.prepare(`INSERT OR IGNORE INTO _group_tables (group_id, table_name) VALUES (?, ?)`).bind(parent.group_id, opts.tableName),
    )
  }
  await db.batch(stmts)
}

export async function ensureNoteNode(
  db: SqliteDatabase,
  opts: { noteId: string; title: string; folderId?: string | null; teamId?: number; ownerId?: number | null },
): Promise<void> {
  const existing = await db.prepare(
    `SELECT id FROM _workspace_nodes WHERE kind = 'note' AND ref = ?`,
  ).bind(opts.noteId).first()
  if (existing) return

  const parent = await assertFolder(db, opts.folderId, opts.teamId)
  const sort = await nextSort(db, opts.teamId, parent?.id ?? null)
  await db.prepare(
    `INSERT INTO _workspace_nodes (id, kind, parent_id, sort_order, title, ref, team_id, owner_id)
     VALUES (?, 'note', ?, ?, ?, ?, ?, ?)`,
  ).bind(
    `wn_n_${opts.noteId}`,
    parent?.id ?? null,
    sort,
    opts.title,
    opts.noteId,
    opts.teamId ?? null,
    opts.ownerId ?? null,
  ).run()
}

export async function removeNodeByRef(db: SqliteDatabase, kind: 'table' | 'note', ref: string): Promise<void> {
  await db.prepare(`DELETE FROM _workspace_nodes WHERE kind = ? AND ref = ?`).bind(kind, ref).run()
}

export async function updateNodeTitleByRef(
  db: SqliteDatabase,
  kind: 'table' | 'note',
  ref: string,
  title: string,
): Promise<void> {
  await db.prepare(
    `UPDATE _workspace_nodes SET title = ?, updated_at = unixepoch() WHERE kind = ? AND ref = ?`,
  ).bind(title, kind, ref).run()
}

export async function listWorkspaceNodes(
  db: SqliteDatabase,
  teamId: number | undefined,
): Promise<WorkspaceNode[]> {
  const sql = teamId !== undefined
    ? `SELECT n.id, n.kind, n.parent_id, n.sort_order, n.title, n.ref, n.group_id, n.team_id,
              CASE
                WHEN n.kind = 'table' THEN (SELECT icon FROM _meta WHERE table_name = n.ref)
                WHEN n.kind = 'note' THEN (SELECT icon FROM _notes WHERE id = n.ref)
                ELSE NULL
              END AS icon
       FROM _workspace_nodes n
       WHERE n.team_id = ?
         AND NOT (n.kind = 'note' AND EXISTS (
           SELECT 1 FROM _notes nt WHERE nt.id = n.ref AND (nt.deleted_at IS NOT NULL OR nt.archived_at IS NOT NULL)
         ))
       ORDER BY n.sort_order ASC, n.created_at ASC`
    : `SELECT n.id, n.kind, n.parent_id, n.sort_order, n.title, n.ref, n.group_id, n.team_id,
              CASE
                WHEN n.kind = 'table' THEN (SELECT icon FROM _meta WHERE table_name = n.ref)
                WHEN n.kind = 'note' THEN (SELECT icon FROM _notes WHERE id = n.ref)
                ELSE NULL
              END AS icon
       FROM _workspace_nodes n
       WHERE NOT (n.kind = 'note' AND EXISTS (
           SELECT 1 FROM _notes nt WHERE nt.id = n.ref AND (nt.deleted_at IS NOT NULL OR nt.archived_at IS NOT NULL)
         ))
       ORDER BY n.sort_order ASC, n.created_at ASC`

  const result = teamId !== undefined
    ? await db.prepare(sql).bind(teamId).all<WorkspaceNode>()
    : await db.prepare(sql).all<WorkspaceNode>()
  return result.results
}

export function filterVisibleNodes(
  nodes: WorkspaceNode[],
  allowedTables: string[] | null,
  allowedNoteIds: Set<string> | null,
): WorkspaceNode[] {
  return nodes.filter((n) => {
    if (n.kind === 'folder') return true
    if (n.kind === 'table') {
      if (!n.ref) return false
      return allowedTables === null || allowedTables.includes(n.ref)
    }
    if (!n.ref) return false
    return allowedNoteIds === null || allowedNoteIds.has(n.ref)
  })
}
