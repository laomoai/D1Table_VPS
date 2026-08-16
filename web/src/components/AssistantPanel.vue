<template>
  <aside class="asst" :class="{ collapsed }">
    <button class="asst-toggle" type="button" :title="collapsed ? '打开助手' : '收起助手'" @click="collapsed = !collapsed">
      {{ collapsed ? '助手' : '收起' }}
    </button>
    <div v-if="!collapsed" class="asst-body">
      <div class="asst-head">助手</div>
      <div ref="listEl" class="asst-list">
        <div v-if="messages.length === 0" class="asst-empty">
          可以说：帮我在「学习」文件夹下建一张学习时间记录表。
        </div>
        <div v-for="(m, i) in messages" :key="i" class="asst-msg" :class="m.role">
          <div class="asst-bubble">{{ m.content }}</div>
          <div v-if="m.draft" class="asst-draft">
            <div class="asst-draft-title">{{ m.draft.title }}</div>
            <div class="asst-draft-meta">
              {{ m.draft.folder_title ? `文件夹：${m.draft.folder_title}` : '工作区根目录' }}
            </div>
            <ul>
              <li v-for="(f, fi) in m.draft.fields" :key="fi">{{ f.title }} · {{ typeLabel(f.field_type) }}</li>
            </ul>
            <button
              v-if="i === messages.length - 1 && !m.done"
              class="asst-confirm"
              type="button"
              :disabled="busy"
              @click="confirmDraft(m)"
            >确认创建</button>
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
import { nextTick, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useQueryClient } from '@tanstack/vue-query'
import { useMessage } from 'naive-ui'
import { assistantApi, type TableDraft } from '@/api/client'

const router = useRouter()
const queryClient = useQueryClient()
const message = useMessage()

const COLLAPSE_KEY = 'mowen_assistant_collapsed'
const collapsed = ref(localStorage.getItem(COLLAPSE_KEY) !== '0')
watch(collapsed, (v) => localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0'))

type ChatMsg = { role: 'user' | 'assistant'; content: string; draft?: TableDraft; done?: boolean }
const messages = ref<ChatMsg[]>([])
const input = ref('')
const busy = ref(false)
const listEl = ref<HTMLElement | null>(null)

function typeLabel(t: string) {
  const map: Record<string, string> = {
    text: '文本', longtext: '长文本', number: '数字', date: '日期',
    datetime: '日期时间', select: '选项', checkbox: '勾选',
  }
  return map[t] || t
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
    const data = await assistantApi.chat(payload)
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
    messages.value.push({ role: 'assistant', content: `已创建「${created.title}」。` })
    queryClient.invalidateQueries({ queryKey: ['workspace'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    router.push(`/tables/${created.name}`)
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
  min-width: 36px;
}
.asst.collapsed { width: 36px; }
.asst:not(.collapsed) { width: 360px; }
.asst-toggle {
  width: 36px;
  border: 0;
  background: #f7f7f5;
  color: #787774;
  font-size: 12px;
  writing-mode: vertical-rl;
  letter-spacing: 2px;
  cursor: pointer;
}
.asst-toggle:hover { color: #37352f; background: #efefed; }
.asst-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.asst-head {
  padding: 14px 14px 10px;
  font-size: 14px;
  font-weight: 600;
  border-bottom: 1px solid #e9e9e7;
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
