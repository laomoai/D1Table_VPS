import { Hono } from 'hono'
import type { AuthVariables, Env } from '../types'
import { requireWriteMiddleware } from '../middleware/auth'
import { createFolder, listWorkspaceNodes, expandTablesAcrossFolders, ensureTableNode } from '../utils/workspace'
import { getUserTables, isValidIdentifier } from '../utils/schema-cache'

const assistant = new Hono<{ Bindings: Env; Variables: AuthVariables }>()

export type DraftField = {
  title: string
  field_type: 'text' | 'longtext' | 'number' | 'date' | 'datetime' | 'select' | 'checkbox'
  options?: string[]
}

export type TableDraft = {
  title: string
  folder_title?: string
  folder_id?: string | null
  create_folder?: boolean
  fields: DraftField[]
  note?: string
}

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'list_workspace',
      description: '列出当前工作区里的文件夹和表格（标题与 id）',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_table',
      description: '提出一张待确认的新表草案，不要直接建表。学习时间记录之类应给出日期、科目、开始、结束、时长、备注等合理字段。',
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
你只能通过工具了解和提议改动，不能假装已经建好了表。
要建表时必须调用 propose_table，等用户在界面点确认后才会真正创建。
学习时间记录：默认字段建议为日期(date)、科目(text 或 select)、开始时间(datetime)、结束时间(datetime)、时长分钟(number)、备注(longtext)。可按用户说法调整。
先 list_workspace 再提议，以便把表放到已有文件夹。找不到文件夹且用户提到了文件夹名时，create_folder=true。
回复简短中文，说明你准备建什么、放在哪。不要编造不存在的表。`

function fieldTypeToSqlite(t: DraftField['field_type']): 'TEXT' | 'INTEGER' {
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
    .filter((n) => n.kind === 'folder' || n.kind === 'table')
    .map((n) => ({ id: n.id, kind: n.kind, title: n.title, parent_id: n.parent_id, ref: n.ref }))
}

async function xaiChat(apiKey: string, messages: unknown[]) {
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'grok-4.5',
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
  const apiKey = c.env.XAI_API_KEY
  if (!apiKey) {
    return c.json({ error: { code: 'NOT_CONFIGURED', message: '未配置 XAI_API_KEY，无法使用助手' } }, 503)
  }
  const body = await c.req.json<{ messages?: Array<{ role: string; content: string }> }>().catch(() => ({ messages: [] as Array<{ role: string; content: string }> }))
  const incoming = (body.messages ?? []).filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
  if (incoming.length === 0) {
    return c.json({ error: { code: 'INVALID_BODY', message: '请输入内容' } }, 400)
  }

  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM },
    ...incoming.slice(-16),
  ]

  let draft: TableDraft | null = null
  let reply = ''

  for (let i = 0; i < 5; i++) {
    const data = await xaiChat(apiKey, messages)
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
        const args = JSON.parse(call.function.arguments || '{}') as TableDraft
        if (call.function.name === 'list_workspace') {
          result = await listWorkspaceBrief(c)
        } else if (call.function.name === 'propose_table') {
          if (!args.title || !Array.isArray(args.fields) || args.fields.length === 0) {
            result = { error: 'title 和 fields 必填' }
          } else {
            draft = {
              title: String(args.title).trim(),
              folder_title: args.folder_title?.trim(),
              folder_id: args.folder_id || null,
              create_folder: !!args.create_folder,
              fields: args.fields.map((f) => ({
                title: String(f.title || '').trim(),
                field_type: f.field_type,
                options: f.options,
              })).filter((f) => f.title),
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
    reply = draft
      ? `准备建「${draft.title}」。请确认下面的字段后，我再真正创建。`
      : '我这边没有得到明确回复，请再说一次。'
  }

  return c.json({ data: { reply, draft } })
})

assistant.post('/confirm', requireWriteMiddleware, async (c) => {
  const body = await c.req.json<{ draft?: TableDraft }>().catch(() => ({ draft: undefined as TableDraft | undefined }))
  const draft = body.draft
  if (!draft?.title || !draft.fields?.length) {
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
