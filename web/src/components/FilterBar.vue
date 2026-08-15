<template>
  <div v-if="columns.length" class="filter-bar">
    <div v-for="(filter, idx) in filters" :key="idx" class="filter-row">
      <n-select
        v-model:value="filter.field"
        :options="columnOptions"
        placeholder="选择字段"
        style="width: 140px;"
        size="small"
        @update:value="() => handleFieldChange(filter)"
      />
      <n-select
        v-model:value="filter.op"
        :options="getOpOptions(filter.field)"
        style="width: 110px;"
        size="small"
      />
      <n-input
        v-model:value="filter.value"
        :placeholder="filter.field === '__all' ? '搜索全部可见字段' : 'Value'"
        style="width: 220px;"
        size="small"
        @keyup.enter="emitFilters()"
      />
      <n-button size="small" quaternary @click="removeFilter(idx)">✕</n-button>
    </div>

    <div class="filter-actions">
      <n-button size="small" dashed @click="addFilter">+ 添加条件</n-button>
      <n-button
        v-if="filters.length"
        size="small"
        type="primary"
        @click="emitFilters()"
      >
        Apply
      </n-button>
      <n-button
        v-if="filters.length"
        size="small"
        @click="clearFilters"
      >
        Clear
      </n-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { NSelect, NInput, NButton } from 'naive-ui'
import type { FieldMeta } from '@/api/client'

const props = defineProps<{ columns: FieldMeta[] }>()
const emit = defineEmits<{ change: [filters: Filter[]] }>()

export interface Filter {
  field: string
  op: string
  value: string
}

const filters = ref<Filter[]>([])

function emitFilters() {
  emit('change', filters.value.map(f => ({ ...f })))
}

const columnOptions = computed(() =>
  [
    { label: '全部字段', value: '__all' },
    ...props.columns
      .filter((c) => !c.isPrimaryKey)
      .map((c) => ({ label: c.title || c.column_name, value: c.column_name }))
  ]
)

const baseOpOptions = [
  { label: '等于', value: 'eq' },
  { label: '不等于', value: 'ne' },
  { label: '包含', value: 'like' },
  { label: '不包含', value: 'nlike' },
  { label: '大于', value: 'gt' },
  { label: '大于等于', value: 'gte' },
  { label: '小于', value: 'lt' },
  { label: '小于等于', value: 'lte' },
]

function getOpOptions(field: string) {
  if (field === '__all') {
    return baseOpOptions.filter((item) => item.value === 'like' || item.value === 'nlike')
  }
  return baseOpOptions
}

function handleFieldChange(filter: Filter) {
  if (filter.field === '__all' && filter.op !== 'like' && filter.op !== 'nlike') {
    filter.op = 'like'
  }
}

function addFilter() {
  filters.value.push({
    field: '__all',
    op: 'like',
    value: '',
  })
}

function removeFilter(idx: number) {
  filters.value.splice(idx, 1)
  emitFilters()
}

function clearFilters() {
  filters.value = []
  emit('change', [])
}
</script>

<style scoped>
.filter-bar {
  padding: 8px 16px;
  background: #f8f9fc;
  border-bottom: 1px solid #e8eaf0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filter-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.filter-actions {
  display: flex;
  gap: 8px;
}
</style>
