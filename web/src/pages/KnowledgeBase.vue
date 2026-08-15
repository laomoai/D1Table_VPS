<template>
  <div class="kb-page">
    <div class="kb-inner">
      <!-- Header -->
      <div class="kb-header">
        <div>
          <h1 class="kb-title">知识库</h1>
          <p class="kb-desc">从侧栏归档的笔记和表格会集中在这里，需要时可以恢复。</p>
        </div>
      </div>

      <!-- Search -->
      <div class="kb-search-wrap">
        <span class="kb-search-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </span>
        <input
          v-model="searchQuery"
          type="text"
          class="kb-search-input"
          placeholder="搜索知识库…"
        />
      </div>

      <!-- Loading -->
      <n-spin v-if="isLoading" style="padding: 80px; display: flex; justify-content: center;" />

      <!-- Error -->
      <div v-else-if="error" class="kb-empty">
        <p class="kb-empty-text" style="color: #e03e3e;">知识库加载失败</p>
      </div>

      <template v-else-if="roots.length > 0 || archivedTables.length > 0">
      <div v-if="archivedTables.length > 0" class="kb-section">
        <h2 class="kb-section-title">归档表格</h2>
        <div class="kb-cards">
          <div
            v-for="t in archivedTables"
            :key="t.name"
            class="kb-card"
            @click="openArchivedTable(t.name)"
          >
            <div class="kb-card-body">
              <div class="kb-card-icon">
                <IonIcon v-if="t.icon && t.icon.startsWith('ion:')" :name="t.icon.slice(4)" :size="24" />
                <span v-else-if="t.icon">{{ t.icon }}</span>
                <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9b9a97" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              </div>
              <h3 class="kb-card-title">{{ t.title || t.name }}</h3>
              <div class="kb-card-meta">
                <span class="kb-card-count">{{ t.row_count ?? 0 }} 行</span>
                <button class="kb-restore-btn" @click.stop="restoreTable(t.name)">恢复到侧栏</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div v-if="roots.length > 0" class="kb-section">
        <h2 class="kb-section-title">归档笔记</h2>
      <div class="kb-cards">
        <div
          v-for="root in roots"
          :key="root.id"
          class="kb-card"
          @click="router.push(`/knowledge-base/${root.id}`)"
        >
          <div v-if="root.cover" class="kb-card-cover">
            <img :src="`/api/files/${root.cover}`" alt="" loading="lazy" />
          </div>
          <div class="kb-card-body">
            <div class="kb-card-icon">
              <span v-if="root.icon && !root.icon.startsWith('ion:')">{{ root.icon }}</span>
              <IonIcon v-else-if="root.icon" :name="root.icon.slice(4)" :size="24" />
              <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#9b9a97" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <h3 class="kb-card-title">{{ root.title }}</h3>
            <p v-if="root.description" class="kb-card-desc">{{ root.description }}</p>
            <div class="kb-card-meta">
              <span class="kb-card-count">{{ root.archived_count }} 篇归档笔记</span>
            </div>
          </div>
        </div>
      </div>
      </div>
      </template>

      <!-- Empty state -->
      <div v-else class="kb-empty">
        <div class="kb-empty-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#c8c7c5" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
        </div>
        <p class="kb-empty-text">{{ searchQuery ? '没有匹配结果' : '还没有归档内容' }}</p>
        <p class="kb-empty-hint">在侧栏把鼠标移到笔记或表格上，点 •••，选择「归档到知识库」。</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useQuery, useQueryClient } from '@tanstack/vue-query'
import { NSpin, useMessage } from 'naive-ui'
import { api, notesApi } from '@/api/client'
import IonIcon from '@/components/IonIcon.vue'

const router = useRouter()
const queryClient = useQueryClient()
const message = useMessage()
const searchQuery = ref('')

const { data: archivedRoots, isLoading, error } = useQuery({
  queryKey: ['notes', 'archived-roots'],
  queryFn: () => notesApi.getArchivedRoots(),
})

const { data: archivedTableList } = useQuery({
  queryKey: ['tables', 'archived'],
  queryFn: () => api.getArchivedTables(),
})

const archivedTables = computed(() => {
  const list = archivedTableList.value ?? []
  if (!searchQuery.value) return list
  const q = searchQuery.value.toLowerCase()
  return list.filter((t) => (t.title || t.name).toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
})

function openArchivedTable(name: string) {
  router.push(`/tables/${name}`)
}

async function restoreTable(name: string) {
  try {
    await api.unarchiveTable(name)
    queryClient.invalidateQueries({ queryKey: ['tables'] })
    queryClient.invalidateQueries({ queryKey: ['tables', 'archived'] })
    queryClient.invalidateQueries({ queryKey: ['workspace'] })
    message.success('表格已恢复到侧栏')
  } catch (err) {
    message.error((err as Error).message)
  }
}

const roots = computed(() => {
  if (!archivedRoots.value) return []
  if (!searchQuery.value) return archivedRoots.value
  const q = searchQuery.value.toLowerCase()
  return archivedRoots.value.filter(r =>
    r.title.toLowerCase().includes(q) ||
    (r.description ?? '').toLowerCase().includes(q)
  )
})
</script>

<style scoped>
.kb-page {
  height: 100%;
  overflow-y: auto;
  background: #fff;
  color: #37352f;
}

.kb-inner {
  max-width: 960px;
  margin: 0 auto;
  padding: 48px 24px 80px;
}

.kb-header {
  margin-bottom: 32px;
}

.kb-title {
  font-size: 30px;
  font-weight: 700;
  color: #37352f;
  margin: 0 0 4px;
  letter-spacing: -0.02em;
}

.kb-desc {
  font-size: 14px;
  color: #787774;
  margin: 0;
}

.kb-search-wrap {
  position: relative;
  margin-bottom: 32px;
}

.kb-search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: #787774;
  display: flex;
  align-items: center;
  pointer-events: none;
}

.kb-search-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 16px 10px 36px;
  background: #f7f7f5;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 14px;
  color: #37352f;
  outline: none;
  transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.kb-search-input::placeholder { color: #9b9a97; }
.kb-search-input:hover { background: #efefed; }
.kb-search-input:focus {
  background: #fff;
  border-color: #e9e9e7;
  box-shadow: inset 0 0 0 1px rgba(35, 131, 226, 0.5), 0 0 0 2px rgba(35, 131, 226, 0.2);
}

.kb-section { margin-bottom: 32px; }
.kb-section-title {
  font-size: 15px;
  font-weight: 600;
  color: #37352f;
  margin: 0 0 12px;
}
.kb-restore-btn {
  margin-left: auto;
  border: none;
  background: rgba(35, 131, 226, 0.08);
  color: #0b6bcb;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.kb-restore-btn:hover { background: rgba(35, 131, 226, 0.14); }
.kb-card-meta { display: flex; align-items: center; gap: 8px; }

/* Cards grid */
.kb-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 16px;
}

.kb-card {
  background: #fff;
  border: 1px solid #e9e9e7;
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.15s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.kb-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.kb-card-cover {
  height: 140px;
  overflow: hidden;
  background: #f7f7f5;
}

.kb-card-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.kb-card-body {
  padding: 16px;
}

.kb-card-icon {
  font-size: 28px;
  line-height: 1;
  margin-bottom: 10px;
  color: #787774;
}

.kb-card-title {
  font-size: 16px;
  font-weight: 600;
  color: #37352f;
  margin: 0 0 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-card-desc {
  font-size: 13px;
  color: #787774;
  margin: 0 0 10px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
}

.kb-card-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.kb-card-count {
  font-size: 12px;
  color: #9b9a97;
}

/* Empty state */
.kb-empty {
  text-align: center;
  padding: 80px 20px;
}

.kb-empty-icon {
  margin-bottom: 16px;
}

.kb-empty-text {
  font-size: 15px;
  color: #787774;
  margin: 0 0 8px;
}

.kb-empty-hint {
  font-size: 13px;
  color: #9b9a97;
  margin: 0;
}
</style>
