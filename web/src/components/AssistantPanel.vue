<template>
  <aside class="asst">
    <div class="asst-body">
      <div class="asst-head">
        <span>AI 助手</span>
        <button class="asst-close" type="button" title="收起" @click="emit('update:open', false)">×</button>
      </div>
      <div v-if="pageHint" class="asst-ctx">当前：{{ pageHint }}</div>
      <div ref="listEl" class="asst-list">
        <div v-if="messages.length === 0" class="asst-empty">
          可以说：帮我给当前表格加上账号密码字段。
        </div>
        <div v-for="(m, i) in messages" :key="i" class="asst-msg" :class="m.role">
          <div v-if="m.role === 'user'" class="asst-bubble">{{ m.content }}</div>
          <div v-else class="asst-bubble md" v-html="renderSafe(m.content)" />
          <div v-if="m.draft" class="asst-draft">
            <div class="asst-draft-title">{{ draftTitle(m.draft) }}</div>
            <div class="asst-draft-meta">{{ draftMeta(m.draft) }}</div>
            <ul>
              <li v-for="(f, fi) in m.draft.fields" :key="fi">{{ f.title }} · {{ typeLabel(f.field_type) }}</li>
            </ul>
            <button
              v-if="i === messages.length - 1 && !m.done"
              class="asst-confirm"
              type="button"
              :disabled="busy"
              @click="confirmDraft(m)"
            >{{ m.draft.action === 'add_fields' ? '确认添加字段' : '确认创建' }}</button>
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
import { computed, nextTick, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useMessage } from 'naive-ui'
import DOMPurify from 'dompurify'
import { assistantApi, type TableDraft, type WorkspaceNode } from '@/api/client'
import { renderMarkdown } from '@/utils/markdown'
import { refreshWorkspace } from '@/composables/workspaceNav'

defineProps<{ open: boolean }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const router = useRouter()
const route = useRoute()
const queryClient = useQueryClient()
const message = useMessage()

type ChatMsg = { role: 'user' | 'assistant'; content: string; draft?: TableDraft; done?: boolean }
const messages = ref<ChatMsg[]>([])
const input = ref('')
const busy = ref(false)
const listEl = ref<HTMLElement | null>(null)

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
  return d.action === 'add_fields' ? `给「${d.title || d.table_name}」加字段` : (d.title || '新表格')
}

function draftMeta(d: TableDraft) {
  if (d.action === 'add_fields') return `表格：${d.table_name}`
  return d.folder_title ? `文件夹：${d.folder_title}` : '工作区根目录'
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
  input.value = ''
  messages.value.push({ role: 'user', content: text })
  busy.value = true
  await scrollBottom()
  try {
    const payload = messages.value.map((m) => ({ role: m.role, content: m.content }))
    const data = await assistantApi.chat(payload, currentContext())
    messages.value.push({ role: 'assistant', content: data.reply, draft: data.draft ?? undefined })
  } catch (err) {
    messages.value.push({ role: 'assistant', content: (err as Error).message })
  } finally {
    busy.value = false
    await scrollBottom()
  }
}

async function confirmDraft(m: ChatMsg) {
  if (!m.draft || busy.value) return
  busy.value = true
  try {
    const created = await assistantApi.confirm(m.draft)
    m.done = true
    if (created.action === 'add_fields') {
      messages.value.push({ role: 'assistant', content: `已给「${created.title}」加上：${(created.added || []).join('、') || '字段'}。` })
    } else {
      messages.value.push({ role: 'assistant', content: `已创建「${created.title}」。` })
    }
    await refreshWorkspace(queryClient)
    queryClient.invalidateQueries({ queryKey: ['fields', created.name] })
    queryClient.invalidateQueries({ queryKey: ['table', created.name] })
    if (router.currentRoute.value.path !== `/tables/${created.name}`) {
      router.push(`/tables/${created.name}`)
    }
  } catch (err) {
    message.error((err as Error).message)
  } finally {
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
.asst-empty { font-size: 13px; color: #9b9a97; line-height: 1.5; }
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
