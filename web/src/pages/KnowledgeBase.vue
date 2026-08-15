<template>
  <div class="kb-page">
    <div class="kb-inner">
      <div class="kb-header">
        <div>
          <h1 class="kb-title">归档</h1>
          <p class="kb-desc">按文件夹整柜收起。里面的表格和笔记只读，需要时再恢复到侧栏。</p>
        </div>
      </div>

      <div class="kb-search-wrap">
        <span class="kb-search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
        <input v-model="searchQuery" type="text" class="kb-search-input" placeholder="搜索归档文件夹…" />
      </div>

      <n-spin v-if="isLoading" style="padding: 80px; display: flex; justify-content: center;" />

      <div v-else-if="error" class="kb-empty">
        <p class="kb-empty-text" style="color: #e03e3e;">归档加载失败</p>
      </div>

      <div v-else-if="folders.length > 0" class="kb-cards">
        <div
          v-for="f in folders"
          :key="f.id"
          class="kb-card"
          @click="router.push(`/archive/${f.id}`)"
        >
          <div class="kb-card-body">
            <h3 class="kb-card-title">{{ f.title || '未命名文件夹' }}</h3>
            <div class="kb-card-meta">
              <span class="kb-card-count">{{ f.table_count }} 张表 · {{ f.note_count }} 篇笔记</span>
              <button class="kb-restore-btn" @click.stop="restore(f.id)">恢复到侧栏</button>
            </div>
          </div>
        </div>
      </div>

      <div v-else class="kb-empty">
        <p class="kb-empty-text">{{ searchQuery ? '没有匹配的文件夹' : '还没有归档的文件夹' }}</p>
        <p class="kb-empty-hint">在侧栏文件夹上点 •••，选择「归档整个文件夹」。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, useMessage } from 'naive-ui'
import { workspaceApi } from '@/api/client'

const router = useRouter()
const queryClient = useQueryClient()
const message = useMessage()
const searchQuery = ref('')

const { data, isLoading, error } = useQuery({
  queryKey: ['workspace', 'archived'],
  queryFn: () => workspaceApi.listArchivedFolders(),
})

const folders = computed(() => {
  const list = data.value ?? []
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter((f) => f.title.toLowerCase().includes(q))
})

async function restore(id: string) {
  try {
    await workspaceApi.unarchiveFolder(id)
    queryClient.invalidateQueries({ queryKey: ['workspace'] })
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['notes'] })
    queryClient.invalidateQueries({ queryKey: ['workspace', 'archived'] })
    message.success('文件夹已恢复到侧栏')
  } catch (err) {
    message.error((err as Error).message)
  }
}
</script>

<style scoped>
.kb-page { height: 100%; overflow-y: auto; background: #fff; color: #37352f; }
.kb-inner { max-width: 960px; margin: 0 auto; padding: 48px 24px 80px; }
.kb-header { margin-bottom: 32px; }
.kb-title { font-size: 30px; font-weight: 700; margin: 0 0 4px; }
.kb-desc { font-size: 14px; color: #787774; margin: 0; }
.kb-search-wrap { position: relative; margin-bottom: 24px; }
.kb-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9b9a97; pointer-events: none; }
.kb-search-input {
  width: 100%; box-sizing: border-box; padding: 10px 16px 10px 36px;
  background: #f7f7f5; border: 1px solid transparent; border-radius: 8px; font-size: 14px; outline: none;
}
.kb-search-input:focus { background: #fff; border-color: #e9e9e7; }
.kb-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px; }
.kb-card { border: 1px solid #e9e9e7; border-radius: 10px; cursor: pointer; }
.kb-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.kb-card-body { padding: 16px; }
.kb-card-title { font-size: 16px; font-weight: 600; margin: 0 0 8px; }
.kb-card-meta { display: flex; align-items: center; gap: 8px; }
.kb-card-count { font-size: 12px; color: #787774; }
.kb-restore-btn {
  margin-left: auto; border: none; background: rgba(35,131,226,0.08); color: #0b6bcb;
  font-size: 12px; padding: 2px 8px; border-radius: 4px; cursor: pointer;
}
.kb-empty { text-align: center; padding: 64px 16px; }
.kb-empty-text { font-size: 15px; color: #787774; }
.kb-empty-hint { font-size: 13px; color: #9b9a97; }
</style>
