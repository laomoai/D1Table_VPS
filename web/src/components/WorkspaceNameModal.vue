<template>
  <n-modal v-model:show="visible" :mask-closable="true" :auto-focus="false">
    <div class="name-sheet">
      <div class="name-kicker">{{ kicker }}</div>
      <h3 class="name-title">{{ title }}</h3>
      <label class="name-field">
        <span class="name-label">Name</span>
        <input
          ref="inputRef"
          v-model="draft"
          class="name-input"
          :placeholder="placeholder"
          maxlength="80"
          @keyup.enter="confirm"
          @keyup.escape="visible = false"
        />
      </label>
      <p class="name-hint">{{ hint }}</p>
      <div class="name-actions">
        <button type="button" class="btn ghost" @click="visible = false">Cancel</button>
        <button type="button" class="btn solid" :disabled="!draft.trim() || submitting" @click="confirm">
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </n-modal>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import { NModal } from 'naive-ui'

const visible = defineModel<boolean>('show', { default: false })
const props = withDefaults(defineProps<{
  title?: string
  kicker?: string
  hint?: string
  placeholder?: string
  confirmLabel?: string
  initial?: string
}>(), {
  title: 'New folder',
  kicker: 'Workspace',
  hint: 'Folders only organize the sidebar. They have no page of their own.',
  placeholder: 'e.g. Clients, Research, Archive',
  confirmLabel: 'Create',
  initial: '',
})

const emit = defineEmits<{ confirm: [name: string] }>()
const draft = ref('')
const submitting = ref(false)
const inputRef = ref<HTMLInputElement>()

watch(visible, async (open) => {
  if (!open) return
  draft.value = props.initial
  submitting.value = false
  await nextTick()
  inputRef.value?.focus()
  inputRef.value?.select()
})

function confirm() {
  const name = draft.value.trim()
  if (!name || submitting.value) return
  submitting.value = true
  emit('confirm', name)
}
</script>

<style scoped>
.name-sheet {
  width: min(400px, calc(100vw - 32px));
  background: #fff;
  border-radius: 10px;
  padding: 22px 22px 18px;
  box-shadow: 0 18px 50px rgba(30, 28, 24, 0.18);
  border: 1px solid #eceae4;
}
.name-kicker {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #9a968e;
  font-weight: 600;
}
.name-title {
  margin: 6px 0 16px;
  font-size: 18px;
  font-weight: 650;
  color: #2c2a26;
  letter-spacing: -0.02em;
}
.name-field { display: flex; flex-direction: column; gap: 6px; }
.name-label { font-size: 12px; color: #6f6b64; font-weight: 500; }
.name-input {
  height: 38px;
  border: 1px solid #ddd9d1;
  border-radius: 7px;
  padding: 0 12px;
  font-size: 14px;
  color: #2c2a26;
  outline: none;
  background: #faf9f6;
}
.name-input:focus {
  border-color: #3d6bff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(61, 107, 255, 0.14);
}
.name-hint {
  margin: 10px 0 16px;
  font-size: 12px;
  line-height: 1.45;
  color: #8a857c;
}
.name-actions { display: flex; justify-content: flex-end; gap: 8px; }
.btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 550;
  cursor: pointer;
  border: 1px solid transparent;
}
.btn.ghost {
  background: #fff;
  border-color: #e4e0d8;
  color: #5c5852;
}
.btn.ghost:hover { background: #f6f4ef; }
.btn.solid {
  background: #2c2a26;
  color: #fff;
}
.btn.solid:hover { background: #1b1a17; }
.btn.solid:disabled { opacity: 0.45; cursor: default; }
</style>
