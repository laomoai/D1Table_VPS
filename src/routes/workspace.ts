import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { getAccessibleNoteIds } from '../utils/note-access'
import {
  backfillMissingGroupFolders,
  createFolder,
  deleteEmptyFolder,
  filterVisibleNodes,
  listWorkspaceNodes,
  moveNode,
  renameFolder,
} from '../utils/workspace'

const workspace = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

workspace.get('/tree', async (c) => {
  await backfillMissingGroupFolders(c.env.DB, c.get('teamId'))
  const nodes = await listWorkspaceNodes(c.env.DB, c.get('teamId'))
  const allowedNoteIds = await getAccessibleNoteIds(c.env.DB, c.get('teamId'), c.get('allowedNoteRootIds'))
  const visible = filterVisibleNodes(nodes, c.get('allowedTables') ?? null, allowedNoteIds)
  return c.json({ data: visible })
})

workspace.post('/folders', requireWriteMiddleware, async (c) => {
  if (c.get('allowedGroupIds') !== null && c.get('allowedGroupIds') !== undefined) {
    return c.json({ error: { code: 'FORBIDDEN', message: 'Scoped API keys cannot create folders' } }, 403)
  }
  const body = await c.req.json<{ title?: string; parent_id?: string | null }>().catch(() => ({}))
  try {
    const node = await createFolder(c.env.DB, {
      title: body.title ?? '',
      parentId: body.parent_id,
      teamId: c.get('teamId'),
      ownerId: c.get('userId') ?? null,
    })
    return c.json({ data: node }, 201)
  } catch (err) {
    return workspaceError(c, err)
  }
})

workspace.patch('/folders/:id', requireWriteMiddleware, async (c) => {
  const body = await c.req.json<{ title?: string }>().catch(() => ({}))
  try {
    await renameFolder(c.env.DB, c.req.param('id'), body.title ?? '', c.get('teamId'))
    return c.json({ data: { success: true } })
  } catch (err) {
    return workspaceError(c, err)
  }
})

workspace.delete('/folders/:id', requireWriteMiddleware, async (c) => {
  try {
    await deleteEmptyFolder(c.env.DB, c.req.param('id'), c.get('teamId'))
    return c.json({ data: { success: true } })
  } catch (err) {
    return workspaceError(c, err)
  }
})

workspace.post('/move', requireWriteMiddleware, async (c) => {
  const body = await c.req.json<{ id?: string; parent_id?: string | null; sort_order?: number }>().catch(() => ({}))
  if (!body.id) {
    return c.json({ error: { code: 'INVALID_BODY', message: 'id is required' } }, 400)
  }
  try {
    await moveNode(c.env.DB, {
      id: body.id,
      parentId: body.parent_id ?? null,
      sortOrder: body.sort_order,
      teamId: c.get('teamId'),
    })
    return c.json({ data: { success: true } })
  } catch (err) {
    return workspaceError(c, err)
  }
})

function workspaceError(c: { json: Function }, err: unknown) {
  const e = err as { status?: number; code?: string; message?: string }
  const status = (e.status === 400 || e.status === 404 || e.status === 409) ? e.status : 500
  if (status === 500) console.error('[workspace]', err)
  return c.json({ error: { code: e.code || 'INTERNAL', message: e.message || 'Workspace error' } }, status)
}

export default workspace
