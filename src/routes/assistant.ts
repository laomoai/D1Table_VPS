import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { createFolder, listWorkspaceNodes, expandTablesAcrossFolders, ensureTableNode, ensureNoteNode } from '../utils/workspace'
import { getUserTables, isValidIdentifier } from '../utils/schema-cache'

const assistant = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

export type DraftField = {
  title: string
  field_type: 'text' | 'longtext' | 'number' | 'date' | 'datetime' | 'select' | 'checkbox' | 'password' | 'totp'
  options?: string[]
}

export type TableDraft = {
  action?: 'create_table' | 'add_fields' | 'create_note'
  table_name?: string
  title?: string
  content?: string
  folder_title?: string
  folder_id?: string | null
  create_folder?: boolean
  fields?: DraftField[]
  note?: string
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_workspace',
      description: '列出当前工作区里的文件夹、表格和笔记（标题与 id）',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_table_schema',
      description: '读取一张已有表的字段。改当前打开的表之前先调用。',
      parameters: {
        type: 'object',
        properties: { table_name: { type: 'string' } },
        required: ['table_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_fields',
      description: '给已有表增加字段的草案，不要直接改表。用户说「这个表」「当前表」「新增字段」时必须用这个，不要 propose_table。',
      parameters: {
        type: 'object',
        properties: {
          table_name: { type: 'string' },
          note: { type: 'string' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'date', 'datetime', 'select', 'checkbox', 'password', 'totp'] },
                options: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'field_type'],
            },
          },
        },
        required: ['table_name', 'fields'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_note',
      description: '读取一篇已有笔记的标题和正文。改当前笔记或另存为新笔记前可调用。',
      parameters: {
        type: 'object',
        properties: { note_id: { type: 'string' } },
        required: ['note_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_note',
      description: '提出一篇待确认的新笔记草案。用户说「存为笔记」「保存为新笔记」「写成笔记」时必须用这个，不要 propose_table，也不要说自己不能建笔记。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          content: { type: 'string', description: 'Markdown 正文' },
          folder_title: { type: 'string' },
          folder_id: { type: 'string' },
          create_folder: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['title', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_table',
      description: '仅当用户明确要新建一张表时才用。给已有表加字段请用 propose_fields。',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '表格显示名' },
          folder_title: { type: 'string', description: '放到哪个文件夹，按名称匹配' },
          folder_id: { type: 'string', description: '若已知文件夹 id 可直接给' },
          create_folder: { type: 'boolean', description: '找不到文件夹时是否新建' },
          note: { type: 'string', description: '给用户看的简短说明' },
          fields: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                field_type: { type: 'string', enum: ['text', 'longtext', 'number', 'date', 'datetime', 'select', 'checkbox'] },
                options: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'field_type'],
            },
          },
        },
        required: ['title', 'fields'],
      },
    },
  },
]

const SYSTEM = `你是墨问里的工作区助手。用户用中文说话。
你可以操作表格和笔记，不要说「只能操作表格」或「无法创建笔记」。
你只能通过工具了解和提议改动，不能假装已经改好了。
系统会告诉你用户当前打开的表格或笔记。
- 「这个表格 / 当前表 / 新增字段」：get_table_schema 后 propose_fields。
- 「新建一张表」：propose_table。
- 「存为笔记 / 保存为新笔记 / 写成笔记 / 这篇存下来」：propose_note，content 用完整 Markdown。
账号密码管理建议字段：名称、账号、密码(password)、网址、备注；可选 TOTP、分类。
先 list_workspace 再决定放到哪个文件夹。回复用简短中文 Markdown。`

function fieldTypeToSqlite(t: string): 'TEXT' | 'INTEGER' {
  if (t === 'number' || t === 'checkbox' || t === 'date' || t === 'datetime') return 'INTEGER'
  return 'TEXT'
}

function randomId(prefix: string, n = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < n; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `${prefix}${id}`
}

async function listWorkspaceBrief(c: { env: Env; get: (k: string) => unknown }) {
  const teamId = c.get('teamId') as number | undefined
  const nodes = await expandTablesAcrossFolders(c.env.DB, teamId, await listWorkspaceNodes(c.env.DB, teamId))
  return nodes
    .filter((n) => n.kind === 'folder' || n.kind === 'table' || n.kind === 'note')
    .map((n) => ({ id: n.id, kind: n.kind, title: n.title, parent_id: n.parent_id, ref: n.ref }))
}

async function getNoteBrief(db: Env['DB'], noteId: string) {
  const row = await db.prepare(
    `SELECT id, title, content FROM _notes WHERE id = ? AND deleted_at IS NULL`,
  ).bind(noteId).first<{ id: string; title: string; content: string }>()
  if (!row) return { error: '找不到这篇笔记' }
  const content = row.content || ''
  return {
    id: row.id,
    title: row.title,
    content: content.length > 16000 ? `${content.slice(0, 16000)}\n…(已截断)` : content,
  }
}

async function getTableSchema(db: Env['DB'], tableName: string) {
  const rows = await db.prepare(
    `SELECT column_name, title, field_type FROM _field_meta WHERE table_name = ? ORDER BY order_index ASC`,
  ).bind(tableName).all<{ column_name: string; title: string; field_type: string }>()
  return { table_name: tableName, fields: rows.results ?? [] }
}

function normalizeFields(fields: DraftField[]): DraftField[] {
  return fields.map((f) => ({
    title: String(f.title || '').trim(),
    field_type: f.field_type,
    options: f.options,
  })).filter((f) => f.title)
}

async function llmChat(apiKey: string, messages: unknown[]) {
  const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
    }),
  })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`模型调用失败：${resp.status} ${text.slice(0, 240)}`)
  }
  return JSON.parse(text) as {
    choices?: Array<{
      message?: {
        role: string
        content?: string | null
        tool_calls?: Array<{ id: string; type: string; function: { name: string; arguments: string } }>
      }
    }>
  }
}

assistant.post('/chat', async (c) => {
  const apiKey = c.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return c.json({ error: { code: 'NOT_CONFIGURED', message: '未配置 DEEPSEEK_API_KEY，无法使用助手' } }, 503)
  }
  const body = await c.req.json<{
    messages?: Array<{ role: string; content: string }>
    context?: { table?: string | null; table_title?: string | null; note?: string | null; note_title?: string | null }
  }>().catch(() => ({ messages: [] as Array<{ role: string; content: string }>, context: undefined }))
  const incoming = (body.messages ?? []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (incoming.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: '请输入内容' } }, 400)
  }

  const ctx = body.context
  let contextLine = '当前没有打开表格或笔记。'
  if (ctx?.table) {
    contextLine = `用户当前打开的表格：table_name=${ctx.table}${ctx.table_title ? `，标题「${ctx.table_title}」` : ''}。改字段必须用 propose_fields，table_name 用这个。`
  } else if (ctx?.note) {
    contextLine = `用户当前打开的笔记：id=${ctx.note}${ctx.note_title ? `，标题「${ctx.note_title}」` : ''}。`
  }

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM },
    { role: 'system', content: contextLine },
    ...incoming.slice(-16),
  ]

  let draft: TableDraft | null = null
  let reply = ''
  const steps: Array<{ name: string; label: string }> = []
  const stepLabel: Record<string, string> = {
    list_workspace: '查看工作区',
    get_table_schema: '读取表格字段',
    get_note: '读取笔记',
    propose_fields: '准备添加字段',
    propose_table: '准备新建表格',
    propose_note: '准备新建笔记',
  }

  for (let i = 0; i < 5; i++) {
    const data = await llmChat(apiKey, messages)
    const msg = data.choices?.[0]?.message
    if (!msg) {
      return c.json({ error: { code: 'MODEL_EMPTY', message: '模型没有返回内容' } }, 502)
    }
    const calls = msg.tool_calls ?? []
    if (calls.length === 0) {
      reply = (msg.content || '').trim()
      break
    }
    messages.push(msg)
    for (const call of calls) {
      let result: unknown = { ok: false }
      try {
        const args = JSON.parse(call.function.arguments || '{}') as TableDraft & { table_name?: string; note_id?: string }
        steps.push({ name: call.function.name, label: stepLabel[call.function.name] || call.function.name })
        if (call.function.name === 'list_workspace') {
          result = await listWorkspaceBrief(c)
        } else if (call.function.name === 'get_note') {
          const nid = String(args.note_id || ctx?.note || '').trim()
          if (!nid) result = { error: '缺少 note_id' }
          else result = await getNoteBrief(c.env.DB, nid)
        } else if (call.function.name === 'propose_note') {
          const title = String(args.title || '').trim()
          const content = String(args.content || '').trim()
          if (!title || !content) {
            result = { error: 'title 和 content 必填' }
          } else {
            draft = {
              action: 'create_note',
              title,
              content,
              folder_title: args.folder_title?.trim(),
              folder_id: args.folder_id || null,
              create_folder: !!args.create_folder,
              note: args.note,
            }
            result = { ok: true, waiting_for_user_confirm: true, draft }
          }
        } else if (call.function.name === 'get_table_schema') {
          const name = String(args.table_name || ctx?.table || '').trim()
          if (!name) result = { error: '缺少 table_name' }
          else result = await getTableSchema(c.env.DB, name)
        } else if (call.function.name === 'propose_fields') {
          const tableName = String(args.table_name || ctx?.table || '').trim()
          const fields = normalizeFields(args.fields || [])
          if (!tableName || fields.length === 0) {
            result = { error: 'table_name 和 fields 必填' }
          } else {
            draft = {
              action: 'add_fields',
              table_name: tableName,
              title: ctx?.table_title || tableName,
              fields,
              note: args.note,
            }
            result = { ok: true, waiting_for_user_confirm: true, draft }
          }
        } else if (call.function.name === 'propose_table') {
          if (!args.title || !Array.isArray(args.fields) || args.fields.length === 0) {
            result = { error: 'title 和 fields 必填' }
          } else {
            draft = {
              action: 'create_table',
              title: String(args.title).trim(),
              folder_title: args.folder_title?.trim(),
              folder_id: args.folder_id || null,
              create_folder: !!args.create_folder,
              fields: normalizeFields(args.fields || []),
              note: args.note,
            }
            result = { ok: true, waiting_for_user_confirm: true, draft }
          }
        } else {
          result = { error: '未知工具' }
        }
      } catch (err) {
        result = { error: (err as Error).message }
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(result),
      })
    }
  }

  if (!reply) {
    reply = draft?.action === 'add_fields'
      ? `准备给当前表增加 ${draft.fields?.length || 0} 个字段，确认后才会写入。`
      : draft?.action === 'create_note'
        ? `准备新建笔记「${draft.title}」。确认后写入工作区。`
        : draft
          ? `准备建「${draft.title}」。请确认下面的字段后，我再真正创建。`
          : '我这边没有得到明确回复，请再说一次。'
  }

  return c.json({ data: { reply, draft, steps } })
})

assistant.post('/confirm', requireWriteMiddleware, async (c) => {
  const body = await c.req.json<{ draft?: TableDraft }>().catch(() => ({ draft: undefined as TableDraft | undefined }))
  const draft = body.draft
  if (!draft) {
    return c.json({ error: { code: 'INVALID_BODY', message: '没有可确认的草案' } }, 400)
  }

  if (draft.action === 'create_note') {
    const title = String(draft.title || '').trim()
    const content = String(draft.content || '').trim()
    if (!title || !content) {
      return c.json({ error: { code: 'INVALID_BODY', message: '笔记标题和正文不能为空' } }, 400)
    }
    const teamId = c.get('teamId')
    const ownerId = c.get('userId') ?? null
    const nodes = await expandTablesAcrossFolders(c.env.DB, teamId, await listWorkspaceNodes(c.env.DB, teamId))
    let folderId = draft.folder_id || null
    if (!folderId && draft.folder_title) {
      const hit = nodes.find((n) => n.kind === 'folder' && n.title === draft.folder_title)
      folderId = hit?.id ?? null
    }
    if (!folderId && draft.folder_title && draft.create_folder) {
      const folder = await createFolder(c.env.DB, {
        title: draft.folder_title,
        teamId,
        ownerId,
      })
      folderId = folder.id
    }
    const id = 'n_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    await c.env.DB.prepare(
      `INSERT INTO _notes (id, title, content, parent_id, created_by, owner_id, team_id)
       VALUES (?, ?, ?, NULL, ?, ?, ?)`,
    ).bind(id, title, content, ownerId, ownerId, teamId ?? null).run()
    await ensureNoteNode(c.env.DB, { noteId: id, title, folderId, teamId, ownerId })
    return c.json({ data: { name: id, title, folder_id: folderId, action: 'create_note' } }, 201)
  }

  if (!draft.fields?.length) {
    return c.json({ error: { code: 'INVALID_BODY', message: '没有可确认的草案' } }, 400)
  }

  if (draft.action === 'add_fields') {
    const tableName = String(draft.table_name || '').trim()
    const tables = await getUserTables(c.env.DB)
    if (!tableName || !tables.includes(tableName)) {
      return c.json({ error: { code: 'NOT_FOUND', message: '找不到要改的表格' } }, 404)
    }
    const existing = await c.env.DB.prepare(
      `SELECT title FROM _field_meta WHERE table_name = ?`,
    ).bind(tableName).all<{ title: string }>()
    const have = new Set((existing.results ?? []).map((r) => (r.title || '').trim().toLowerCase()))
    const maxOrder = await c.env.DB.prepare(
      `SELECT COALESCE(MAX(order_index), 0) as max_order FROM _field_meta WHERE table_name = ?`,
    ).bind(tableName).first<{ max_order: number }>()
    let order = maxOrder?.max_order ?? 0
    const added: string[] = []
    for (const f of draft.fields) {
      const title = f.title.trim()
      if (!title || have.has(title.toLowerCase())) continue
      const columnName = randomId('col_', 4)
      const sqliteType = fieldTypeToSqlite(f.field_type)
      const select_options = f.field_type === 'select' && f.options?.length
        ? JSON.stringify(f.options.map((label, i) => ({
          value: label, label, color: ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2'][i % 5],
        })))
        : null
      order += 10
      await c.env.DB.batch([
        c.env.DB.prepare(`ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${sqliteType}`),
        c.env.DB.prepare(
          `INSERT INTO _field_meta (table_name, column_name, title, field_type, select_options, order_index, width)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(tableName, columnName, title, f.field_type, select_options, order, 180),
      ])
      have.add(title.toLowerCase())
      added.push(title)
    }
    return c.json({ data: { name: tableName, title: draft.title || tableName, folder_id: null, action: 'add_fields', added } })
  }

  if (!draft.title) {
    return c.json({ error: { code: 'INVALID_BODY', message: '没有可确认的草案' } }, 400)
  }

  const teamId = c.get('teamId')
  const ownerId = c.get('userId') ?? null
  const nodes = await expandTablesAcrossFolders(c.env.DB, teamId, await listWorkspaceNodes(c.env.DB, teamId))
  let folderId = draft.folder_id || null
  if (!folderId && draft.folder_title) {
    const hit = nodes.find((n) => n.kind === 'folder' && n.title === draft.folder_title)
    folderId = hit?.id ?? null
  }
  if (!folderId && draft.folder_title && draft.create_folder) {
    const folder = await createFolder(c.env.DB, {
      title: draft.folder_title,
      teamId,
      ownerId,
    })
    folderId = folder.id
  }

  const tableName = randomId('tbl_')
  const existing = await getUserTables(c.env.DB)
  if (existing.includes(tableName) || !isValidIdentifier(tableName)) {
    return c.json({ error: { code: 'CONFLICT', message: '表名生成失败，请再试一次' } }, 409)
  }

  const columns = draft.fields.map((f) => {
    const name = randomId('col_', 4)
    const type = fieldTypeToSqlite(f.field_type)
    const select_options = f.field_type === 'select' && f.options?.length
      ? f.options.map((label, i) => ({
        value: label,
        label,
        color: ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2'][i % 5],
      }))
      : undefined
    return {
      name,
      title: f.title,
      type,
      field_type: f.field_type,
      select_options,
    }
  })

  const colDefs = columns.map((col) => `"${col.name}" ${col.type}`)
  const createSQL = `CREATE TABLE "${tableName}" (
  "id" INTEGER PRIMARY KEY AUTOINCREMENT,
  ${colDefs.join(',\n  ')},
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
)`

  const allMeta = [
    { name: 'id', title: 'ID', field_type: 'number', select_options: null as string | null },
    ...columns.map((col) => ({
      name: col.name,
      title: col.title,
      field_type: col.field_type,
      select_options: col.select_options ? JSON.stringify(col.select_options) : null,
    })),
    { name: 'created_at', title: '创建时间', field_type: 'datetime', select_options: null },
  ]

  await c.env.DB.batch([
    c.env.DB.prepare(createSQL),
    c.env.DB.prepare(
      `INSERT OR IGNORE INTO _meta (table_name, row_count, title, owner_id, team_id) VALUES (?, 0, ?, ?, ?)`,
    ).bind(tableName, draft.title, ownerId, teamId ?? null),
    ...allMeta.map((col, idx) =>
      c.env.DB.prepare(
        `INSERT OR IGNORE INTO _field_meta (table_name, column_name, title, field_type, select_options, order_index, width, is_hidden)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        tableName,
        col.name,
        col.title,
        col.field_type,
        col.select_options,
        idx * 10,
        col.name === 'id' ? 80 : 180,
        col.name === 'created_at' ? 1 : 0,
      ),
    ),
  ])

  await ensureTableNode(c.env.DB, {
    tableName,
    title: draft.title,
    folderId,
    teamId,
    ownerId,
  })

  return c.json({ data: { name: tableName, title: draft.title, folder_id: folderId } }, 201)
})

export default assistant
