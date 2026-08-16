<template>
  <button v-if="to" type="button" class="archive-back" @click="go">
    ← {{ label }}
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const props = defineProps<{ fallbackLabel?: string }>()
const route = useRoute()
const router = useRouter()

const folderId = computed(() => {
  const q = route.query.folder
  return typeof q === 'string' && q ? q : ''
})
const fromArchive = computed(() => route.query.from === 'archive' || !!folderId.value)
const to = computed(() => {
  if (!fromArchive.value) return ''
  return folderId.value ? `/archive/${folderId.value}` : '/archive'
})
const label = computed(() => props.fallbackLabel || '返回上一级')

function go() {
  if (to.value) router.push(to.value)
}
</script>

<style scoped>
.archive-back {
  flex-shrink: 0;
  align-self: flex-start;
  border: 0;
  background: none;
  color: #787774;
  cursor: pointer;
  font-size: 13px;
  padding: 8px 4px 4px;
}
.archive-back:hover { color: #37352f; }
</style>
