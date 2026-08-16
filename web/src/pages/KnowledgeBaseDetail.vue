<template>
  <div class="kbd-page">
    <div class="kbd-inner">
      <button class="kbd-back" @click="goUp">
        ← {{ parentFolderId ? '上一级' : '归档' }}
      </button>

      <n-spin v-if="isLoading" style="padding: 80px; display: flex; justify-content: center;" />

      <template v-else-if="data">
        <div class="kbd-header">
          <h1 class="kbd-title">{{ data.folder.title || '未命名文件夹' }}</h1>
          <button class="kbd-btn" @click="restore">恢复整个文件夹</button>
        </div>
        <p class="kbd-hint">只读。点开可查看，不能修改。</p>

        <div class="kbd-list">
          <div
            v-for="n in children"
            :key="n.id"
            class="kbd-row"
            @click="openNode(n)"
          >
            <span class="kbd-kind">{{ n.kind === 'table' ? '表格' : n.kind === 'note' ? '笔记' : '文件夹' }}</span>
            <span class="kbd-name">{{ n.title || '未命名' }}</span>
          </div>
          <div v-if="children.length === 0" class="kbd-empty">这个文件夹是空的</div>
        </div>
      </template>

      <div v-else class="kbd-empty">找不到这个归档文件夹</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, useMessage } from 'naive-ui'
import { workspaceApi, type WorkspaceNode } from '@/api/client'

const route = useRoute()
const router = useRouter()
const queryClient = useQueryClient()
const message = useMessage()

const folderId = computed(() => String(route.params.folderId || route.params.rootId || ''))

const { data, isLoading } = useQuery({
  queryKey: computed(() => ['workspace', 'archived', folderId.value]),
  queryFn: () => workspaceApi.getArchivedFolder(folderId.value),
  enabled: computed(() => !!folderId.value),
})

const children = computed(() => {
  const nodes = data.value?.nodes ?? []
  const id = data.value?.folder.id
  return nodes.filter((n) => n.parent_id === id)
})

const parentFolderId = computed(() => data.value?.folder.parent_id || '')

function goUp() {
  router.push(parentFolderId.value ? `/archive/${parentFolderId.value}` : '/archive')
}

function openNode(n: WorkspaceNode) {
  const folder = folderId.value
  const q = { from: 'archive', folder }
  if (n.kind === 'table' && n.ref) router.push({ path: `/tables/${n.ref}`, query: q })
  else if (n.kind === 'note' && n.ref) router.push({ path: `/notes/${n.ref}`, query: q })
  else if (n.kind === 'folder') router.push(`/archive/${n.id}`)
}

async function restore() {
  try {
    await workspaceApi.unarchiveFolder(folderId.value)
    queryClient.invalidateQueries({ queryKey: ['workspace'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
    queryClient.invalidateQueries({ queryKey: ['workspace', 'archived'] })
    message.success('已恢复到侧栏')
    router.push('/')
  } catch (err) {
    message.error((err as Error).message)
  }
}
</script>

<style scoped>
.kbd-page { height: 100%; overflow-y: auto; background: #fff; }
.kbd-inner { max-width: 720px; margin: 0 auto; padding: 32px 24px 80px; }
.kbd-back { border: 0; background: none; color: #787774; cursor: pointer; margin-bottom: 20px; }
.kbd-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.kbd-title { font-size: 24px; font-weight: 700; margin: 0; }
.kbd-hint { font-size: 13px; color: #787774; margin: 8px 0 24px; }
.kbd-btn {
  border: 0; background: rgba(35,131,226,0.1); color: #0b6bcb;
  padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px;
}
.kbd-list { border: 1px solid #e9e9e7; border-radius: 8px; overflow: hidden; }
.kbd-row {
  display: flex; gap: 10px; padding: 10px 14px; border-bottom: 1px solid #f0f0f0; cursor: pointer;
}
.kbd-row:last-child { border-bottom: 0; }
.kbd-row:hover { background: #f7f7f5; }
.kbd-kind { font-size: 12px; color: #9b9a97; width: 36px; }
.kbd-name { font-size: 14px; }
.kbd-empty { color: #9b9a97; padding: 24px; text-align: center; }
</style>
