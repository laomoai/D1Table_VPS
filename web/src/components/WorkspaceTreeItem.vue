<template>
  <div class="ws-tree-item">
    <div
      class="ws-item"
      :style="itemStyle"
      :class="{
        active: isActive,
        'drop-above': dropPosition === 'above' && dropTargetId === node.id,
        'drop-child': dropPosition === 'child' && dropTargetId === node.id,
        folder: node.kind === 'folder',
      }"
      draggable="true"
      @click="onClick"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="ws-drag-handle" title="Drag">⋮⋮</span>
      <span
        v-if="node.kind === 'folder' || hasChildren"
        class="ws-arrow"
        :class="{ expanded: expandedIds.has(node.id) }"
        @click.stop="emit('toggle', node.id)"
      >›</span>
      <span v-else class="ws-arrow-placeholder" />
      <span class="ws-icon">
        <IonIcon v-if="node.icon && node.icon.startsWith('ion:')" :name="node.icon.slice(4)" :size="14" />
        <span v-else-if="node.icon" class="ws-emoji">{{ node.icon }}</span>
        <IonIcon v-else :name="defaultIcon" :size="14" />
      </span>
      <span class="ws-title-wrap">
        <HoverTooltipText :text="node.title || 'Untitled'" class-name="ws-title" />
      </span>
      <div class="ws-actions">
        <button
          v-if="node.kind === 'folder'"
          class="ws-action-btn"
          title="Delete folder"
          @click.stop="emit('delete-folder', node.id)"
        >×</button>
        <button class="ws-action-btn" title="Add inside" @click.stop="emit('add-here', node.id)">+</button>
      </div>
    </div>
    <div v-if="hasChildren && expandedIds.has(node.id)" class="ws-children">
      <WorkspaceTreeItem
        v-for="child in children"
        :key="child.id"
        :node="child"
        :children="childrenMap.get(child.id) ?? []"
        :children-map="childrenMap"
        :active-table="activeTable"
        :active-note-id="activeNoteId"
        :expanded-ids="expandedIds"
        :item-style="itemStyle"
        :drop-target-id="dropTargetId"
        :drop-position="dropPosition"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @add-here="emit('add-here', $event)"
        @delete-folder="emit('delete-folder', $event)"
        @reorder="emit('reorder', $event)"
        @update:drop-state="emit('update:drop-state', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { WorkspaceNode } from '@/api/client'
import HoverTooltipText from './HoverTooltipText.vue'
import IonIcon from './IonIcon.vue'

const props = defineProps<{
  node: WorkspaceNode
  children: WorkspaceNode[]
  childrenMap: Map<string, WorkspaceNode[]>
  activeTable: string | null
  activeNoteId: string | null
  expandedIds: Set<string>
  itemStyle?: string | Record<string, string>
  dropTargetId?: string | null
  dropPosition?: 'above' | 'child' | null
}>()

const emit = defineEmits<{
  select: [node: WorkspaceNode]
  toggle: [id: string]
  'add-here': [folderId: string]
  'delete-folder': [id: string]
  reorder: [payload: { dragId: string; dropId: string; mode: 'above' | 'child' }]
  'update:drop-state': [state: { id: string | null; position: 'above' | 'child' | null }]
}>()

const hasChildren = computed(() => props.children.length > 0)
const isActive = computed(() => {
  if (props.node.kind === 'table') return props.node.ref === props.activeTable
  if (props.node.kind === 'note') return props.node.ref === props.activeNoteId
  return false
})
const defaultIcon = computed(() => {
  if (props.node.kind === 'folder') return 'FolderOutline'
  if (props.node.kind === 'table') return 'GridOutline'
  return 'DocumentOutline'
})

function onClick() {
  if (props.node.kind === 'folder') {
    emit('toggle', props.node.id)
    return
  }
  emit('select', props.node)
}

function onDragStart(e: DragEvent) {
  e.dataTransfer?.setData('text/plain', props.node.id)
  e.dataTransfer!.effectAllowed = 'move'
}

function onDragOver(e: DragEvent) {
  e.dataTransfer!.dropEffect = 'move'
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const y = e.clientY - rect.top
  const canChild = props.node.kind === 'folder'
  const position: 'above' | 'child' = (!canChild || y / rect.height < 0.35) ? 'above' : 'child'
  emit('update:drop-state', { id: props.node.id, position })
}

function onDragEnd() {
  emit('update:drop-state', { id: null, position: null })
}

function onDragLeave() {
  emit('update:drop-state', { id: null, position: null })
}

function onDrop(e: DragEvent) {
  const dragId = e.dataTransfer?.getData('text/plain')
  if (!dragId || dragId === props.node.id) {
    emit('update:drop-state', { id: null, position: null })
    return
  }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const canChild = props.node.kind === 'folder'
  const mode: 'above' | 'child' = (!canChild || (e.clientY - rect.top) / rect.height < 0.35) ? 'above' : 'child'
  emit('reorder', { dragId, dropId: props.node.id, mode })
  emit('update:drop-state', { id: null, position: null })
}
</script>

<style scoped>
.ws-tree-item { user-select: none; }
.ws-item {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
  box-sizing: border-box;
  padding: 5px 4px 5px 0;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: #37352f;
  border: 2px solid transparent;
}
.ws-item:hover { background: rgba(55, 53, 47, 0.06); }
.ws-item.active { background: rgba(55, 53, 47, 0.1); font-weight: 500; }
.ws-item.drop-above { border-top: 2px solid #2383e2; border-radius: 0; }
.ws-item.drop-child { background: rgba(35, 131, 226, 0.1); border: 2px solid rgba(35, 131, 226, 0.3); }
.ws-drag-handle {
  width: 14px;
  font-size: 10px;
  color: transparent;
  cursor: grab;
  text-align: center;
  flex-shrink: 0;
  letter-spacing: -2px;
}
.ws-item:hover .ws-drag-handle { color: #c4c4c0; }
.ws-arrow {
  font-size: 11px;
  color: #a3a19d;
  width: 14px;
  text-align: center;
  transition: transform 0.12s;
  flex-shrink: 0;
}
.ws-arrow.expanded { transform: rotate(90deg); }
.ws-arrow-placeholder { width: 14px; flex-shrink: 0; }
.ws-icon { flex-shrink: 0; }
.ws-emoji { font-size: 14px; line-height: 1; }
.ws-title-wrap { flex: 1; min-width: 0; overflow: hidden; }
.ws-actions { display: none; gap: 2px; flex-shrink: 0; }
.ws-item:hover .ws-actions { display: flex; }
.ws-action-btn {
  background: none; border: none;
  padding: 0 3px; font-size: 14px;
  color: #a3a19d; cursor: pointer;
  border-radius: 2px;
}
.ws-action-btn:hover { color: #37352f; background: rgba(55,53,47,0.08); }
.ws-children { padding-left: 16px; }
</style>
