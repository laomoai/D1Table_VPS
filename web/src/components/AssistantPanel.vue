<template>
  <aside class="asst">
    <div class="asst-body">
      <div class="asst-head">
        <span>AI 助手</span>
        <div class="asst-head-actions">
          <button class="asst-icon-btn" type="button" title="新对话" @click="newThread">新对话</button>
          <button class="asst-icon-btn" type="button" title="历史记录" :class="{ on: showHistory }" @click="showHistory = !showHistory">记录</button>
          <button class="asst-close" type="button" title="收起" @click="emit('update:open', false)">×</button>
        </div>
      </div>
      <div v-if="showHistory" class="asst-history">
        <div v-if="threads.length === 0" class="asst-empty">还没有历史对话</div>
        <button
          v-for="t in threads"
          :key="t.id"
          class="asst-hist-item"
          :class="{ current: t.id === threadId }"
          type="button"
          @click="openThread(t.id)"
        >
          <span class="asst-hist-title">{{ t.title }}</span>
          <span class="asst-hist-time">{{ formatTime(t.updatedAt) }}</span>
        </button>
      </div>
      <div v-if="pageHint" class="asst-ctx">当前：{{ pageHint }}</div>
      <div ref="listEl" class="asst-list">
        <div v-if="messages.length === 0 && !busy" class="asst-empty">
          可以说：帮我把这段存成新笔记，或给当前表格加字段。
        </div>
        <div v-for="(m, i) in messages" :key="i" class="asst-msg" :class="m.role">
          <div v-if="m.role === 'user'" class="asst-bubble">{{ m.content }}</div>
          <template v-else>
            <div v-if="m.steps?.length" class="asst-steps">
              <div v-for="(s, si) in m.steps" :key="si" class="asst-step done">{{ s.label }}</div>
            </div>
            <div v-if="m.content" class="asst-bubble md" v-html="renderSafe(m.content)" />
          </template>
          <div v-if="m.draft" class="asst-draft">
            <div class="asst-draft-title">{{ draftTitle(m.draft) }}</div>
            <div class="asst-draft-meta">{{ draftMeta(m.draft) }}</div>
            <ul v-if="m.draft.action !== 'create_note' && m.draft.fields?.length">
              <li v-for="(f, fi) in m.draft.fields" :key="fi">{{ f.title }} · {{ typeLabel(f.field_type) }}</li>
            </ul>
            <div v-if="m.draft.action === 'create_note'" class="asst-note-preview">{{ notePreview(m.draft.content) }}</div>
            <button
              v-if="i === messages.length - 1 && !m.done"
              class="asst-confirm"
              type="button"
              :disabled="busy"
              @click="confirmDraft(m)"
            >{{ confirmLabel(m.draft) }}</button>
          </div>
        </div>
        <div v-if="busy" class="asst-msg assistant">
          <div class="asst-thinking">
            <span class="asst-spinner" aria-hidden="true" />
            <span>{{ thinkingLabel }}</span>
          </div>
        </div>
      </div>
      <form class="asst-input" @submit.prevent="send">
        <textarea v-model="input" rows="2" placeholder="用一句话说你要做什么…" :disabled="busy" @keydown.enter.exact.prevent="send" />
        <button type="submit" :disabled="busy || !input.trim()">发送</button>
      </form>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useMessage } from 'naive-ui'
import DOMPurify from 'dompurify'
import { assistantApi, type AssistantStep, type TableDraft, type WorkspaceNode } from '@/api/client'
import { renderMarkdown } from '@/utils/markdown'
import { refreshWorkspace } from '@/composables/workspaceNav'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()
const message = useMessage()

type ChatMsg = { role: 'user' | 'assistant'; content: string; draft?: TableDraft; done?: boolean; steps?: AssistantStep[] }
type Thread = { id: string; title: string; updatedAt: number; messages: ChatMsg[] }

const STORE_KEY = 'mowen_assistant_threads'
const ACTIVE_KEY = 'mowen_assistant_active'

function loadThreads(): Thread[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || '[]') as Thread[]
    return Array.isArray(raw) ? raw.slice(0, 30) : []
  } catch {
    return []
  }
}

const threads = ref<Thread[]>(loadThreads())
const threadId = ref(localStorage.getItem(ACTIVE_KEY) || '')
const current = computed(() => threads.value.find((t) => t.id === threadId.value))
const messages = ref<ChatMsg[]>(current.value?.messages ?? [])
const input = ref('')
const busy = ref(false)
const showHistory = ref(false)
const listEl = ref<HTMLElement | null>(null)
const thinkingLabel = ref('思考中…')
let thinkTimer: number | null = null

const THINK_CYCLE = ['思考中…', '正在查看工作区…', '正在整理回复…']

function startThinking() {
  let i = 0
  thinkingLabel.value = THINK_CYCLE[0]
  thinkTimer = window.setInterval(() => {
    i = (i + 1) % THINK_CYCLE.length
    thinkingLabel.value = THINK_CYCLE[i]
  }, 1600)
}

function stopThinking() {
  if (thinkTimer != null) {
    window.clearInterval(thinkTimer)
    thinkTimer = null
  }
}

function persist() {
  const list = threads.value
    .map((t) => (t.id === threadId.value ? { ...t, messages: messages.value, updatedAt: Date.now(), title: threadTitle(messages.value) } : t))
    .filter((t) => t.messages.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 30)
  threads.value = list
  localStorage.setItem(STORE_KEY, JSON.stringify(list))
  if (threadId.value) localStorage.setItem(ACTIVE_KEY, threadId.value)
}

function threadTitle(msgs: ChatMsg[]) {
  const first = msgs.find((m) => m.role === 'user')?.content?.trim() || '新对话'
  return first.slice(0, 28)
}

function formatTime(ts: number) {
  const d = new Date(ts)
  const mm = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mi = `${d.getMinutes()}`.padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function newThread() {
  threadId.value = `t_${Date.now().toString(36)}`
  messages.value = []
  showHistory.value = false
  localStorage.setItem(ACTIVE_KEY, threadId.value)
}

function openThread(id: string) {
  const t = threads.value.find((x) => x.id === id)
  if (!t) return
  threadId.value = id
  messages.value = t.messages
  showHistory.value = false
  localStorage.setItem(ACTIVE_KEY, id)
  void scrollBottom()
}

watch(messages, persist, { deep: true })
onUnmounted(stopThinking)

function typeLabel(t: string) {
  const map: Record<string, string> = {
    text: '文本', longtext: '长文本', number: '数字', date: '日期',
    datetime: '日期时间', select: '选项', checkbox: '勾选',
    password: '密码', totp: '验证码',
  }
  return map[t] || t
}

function renderSafe(md: string) {
  return DOMPurify.sanitize(renderMarkdown(md || ''))
}

function draftTitle(d: TableDraft) {
  if (d.action === 'add_fields') return `给「${d.title || d.table_name}」加字段`
  if (d.action === 'create_note') return `新笔记「${d.title}」`
  return d.title || '新表格'
}

function draftMeta(d: TableDraft) {
  if (d.action === 'add_fields') return `表格：${d.table_name}`
  return d.folder_title ? `文件夹：${d.folder_title}` : '工作区根目录'
}

function confirmLabel(d: TableDraft) {
  if (d.action === 'add_fields') return '确认添加字段'
  if (d.action === 'create_note') return '确认创建笔记'
  return '确认创建表格'
}

function notePreview(content?: string) {
  const t = (content || '').replace(/\s+/g, ' ').trim()
  return t.length > 160 ? `${t.slice(0, 160)}…` : t
}

const pageHint = computed(() => {
  const table = typeof route.params.tableName === 'string' ? route.params.tableName : ''
  const note = typeof route.params.noteId === 'string' ? route.params.noteId : ''
  const nodes = queryClient.getQueryData<WorkspaceNode[]>(['workspace']) ?? []
  if (table) {
    const hit = nodes.find((n) => n.kind === 'table' && n.ref === table)
    return `表格「${hit?.title || table}」`
  }
  if (note) {
    const hit = nodes.find((n) => n.kind === 'note' && n.ref === note)
    return `笔记「${hit?.title || note}」`
  }
  return ''
})

function currentContext() {
  const table = typeof route.params.tableName === 'string' ? route.params.tableName : null
  const note = typeof route.params.noteId === 'string' ? route.params.noteId : null
  const nodes = queryClient.getQueryData<WorkspaceNode[]>(['workspace']) ?? []
  return {
    table,
    table_title: table ? (nodes.find((n) => n.kind === 'table' && n.ref === table)?.title ?? null) : null,
    note,
    note_title: note ? (nodes.find((n) => n.kind === 'note' && n.ref === note)?.title ?? null) : null,
  }
}

async function scrollBottom() {
  await nextTick()
  if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
}

async function send() {
  const text = input.value.trim()
  if (!text || busy.value) return
  if (!threadId.value) threadId.value = `t_${Date.now().toString(36)}`
  input.value = ''
  messages.value.push({ role: 'user', content: text })
  busy.value = true
  startThinking()
  await scrollBottom()
  try {
    const payload = messages.value.filter((m) => m.content).map((m) => ({ role: m.role, content: m.content }))
    const data = await assistantApi.chat(payload, currentContext())
    messages.value.push({
      role: 'assistant',
      content: data.reply,
      draft: data.draft ?? undefined,
      steps: data.steps,
    })
  } catch (err) {
    messages.value.push({ role: 'assistant', content: (err as Error).message })
  } finally {
    stopThinking()
    busy.value = false
    await scrollBottom()
  }
}

async function confirmDraft(m: ChatMsg) {
  if (!m.draft || busy.value) return
  busy.value = true
  thinkingLabel.value = '正在写入工作区…'
  startThinking()
  try {
    const created = await assistantApi.confirm(m.draft)
    m.done = true
    if (created.action === 'add_fields') {
      messages.value.push({ role: 'assistant', content: `已给「${created.title}」加上：${(created.added || []).join('、') || '字段'}。` })
    } else if (created.action === 'create_note') {
      messages.value.push({ role: 'assistant', content: `已创建笔记「${created.title}」。` })
    } else {
      messages.value.push({ role: 'assistant', content: `已创建表格「${created.title}」。` })
    }
    await refreshWorkspace(queryClient)
    queryClient.invalidateQueries({ queryKey: ['fields', created.name] })
    queryClient.invalidateQueries({ queryKey: ['table', created.name] })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
    const path = created.action === 'create_note' ? `/notes/${created.name}` : `/tables/${created.name}`
    if (router.currentRoute.value.path !== path) router.push(path)
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    stopThinking()
    busy.value = false
    await scrollBottom()
  }
}
</script>

<style scoped>
.asst {
  flex-shrink: 0;
  display: flex;
  border-left: 1px solid #e9e9e7;
  background: #fbfbfa;
  width: 360px;
}
.asst-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.asst-head {
  padding: 12px 10px 10px 14px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e9e9e7;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.asst-head-actions { display: flex; align-items: center; gap: 2px; }
.asst-icon-btn {
  border: 0;
  background: transparent;
  color: #787774;
  font-size: 12px;
  padding: 4px 6px;
  border-radius: 6px;
  cursor: pointer;
}
.asst-icon-btn:hover,
.asst-icon-btn.on { background: #efeafd; color: #37352f; }
.asst-history {
  max-height: 180px;
  overflow-y: auto;
  border-bottom: 1px solid #e9e9e7;
  padding: 6px;
}
.asst-hist-item {
  width: 100%;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  background: transparent;
  text-align: left;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}
.asst-hist-item:hover,
.asst-hist-item.current { background: #efeafd; }
.asst-hist-title {
  font-size: 12px;
  color: #37352f;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asst-hist-time { font-size: 11px; color: #9b9a97; flex-shrink: 0; }
.asst-close {
  border: 0;
  background: transparent;
  color: #9b9a97;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 2px 6px;
}
.asst-close:hover { color: #37352f; }
.asst-ctx {
  padding: 6px 14px;
  font-size: 12px;
  color: #7c5cff;
  background: #f4f0ff;
  border-bottom: 1px solid #ece6ff;
}
.asst-list {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.asst-empty { font-size: 13px; color: #9b9a97; line-height: 1.5; padding: 8px; }
.asst-steps { display: flex; flex-direction: column; gap: 4px; margin-bottom: 6px; }
.asst-step {
  font-size: 12px;
  color: #7c5cff;
}
.asst-step.done::before { content: '✓ '; }
.asst-thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: #7c5cff;
  padding: 6px 2px;
}
.asst-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #ddd6fe;
  border-top-color: #7c5cff;
  border-radius: 50%;
  animation: asst-spin 0.7s linear infinite;
}
@keyframes asst-spin { to { transform: rotate(360deg); } }
.asst-note-preview {
  color: #787774;
  line-height: 1.45;
  margin-bottom: 6px;
}
.asst-msg.user { align-self: flex-end; max-width: 92%; }
.asst-msg.assistant { align-self: flex-start; max-width: 92%; }
.asst-bubble {
  font-size: 13px;
  line-height: 1.5;
  padding: 8px 10px;
  border-radius: 8px;
  white-space: pre-wrap;
}
.asst-msg.user .asst-bubble { background: #37352f; color: #fff; }
.asst-msg.assistant .asst-bubble { background: #fff; border: 1px solid #e9e9e7; color: #37352f; }
.asst-bubble.md :deep(p) { margin: 0 0 0.5em; }
.asst-bubble.md :deep(p:last-child) { margin-bottom: 0; }
.asst-bubble.md :deep(ul),
.asst-bubble.md :deep(ol) { margin: 0.3em 0; padding-left: 1.2em; }
.asst-bubble.md :deep(code) { font-size: 0.9em; background: #f1f1ef; padding: 0 4px; border-radius: 3px; }
.asst-bubble.md :deep(pre) { overflow: auto; background: #f7f7f5; padding: 8px; border-radius: 6px; }
.asst-bubble.md :deep(h1),
.asst-bubble.md :deep(h2),
.asst-bubble.md :deep(h3) { font-size: 13px; margin: 0.4em 0; }
.asst-draft {
  margin-top: 6px;
  padding: 8px 10px;
  background: #fff;
  border: 1px solid #e9e9e7;
  border-radius: 8px;
  font-size: 12px;
}
.asst-draft-title { font-weight: 600; }
.asst-draft-meta { color: #787774; margin: 4px 0 6px; }
.asst-draft ul { margin: 0; padding-left: 18px; color: #37352f; }
.asst-confirm {
  margin-top: 8px;
  border: 0;
  background: #37352f;
  color: #fff;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
}
.asst-confirm:disabled { opacity: 0.5; }
.asst-input {
  border-top: 1px solid #e9e9e7;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.asst-input textarea {
  resize: none;
  border: 1px solid #e9e9e7;
  border-radius: 6px;
  padding: 8px;
  font: inherit;
  font-size: 13px;
}
.asst-input button {
  align-self: flex-end;
  border: 0;
  background: #37352f;
  color: #fff;
  border-radius: 6px;
  padding: 6px 12px;
  cursor: pointer;
}
.asst-input button:disabled { opacity: 0.45; }
</style>
