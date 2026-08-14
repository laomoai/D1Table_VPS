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
      <div v-if="!manageMode" class="ws-actions">
        <button
          v-if="node.kind === 'folder'"
          class="ws-action-btn"
          title="Add inside"
          @click.stop="emit('add-here', node.id)"
        >+</button>
      </div>
      <div v-else class="ws-manage" @click.stop>
        <button class="ws-manage-btn" title="Rename" @click="emit('rename', node)">Rename</button>
        <select class="ws-move" :value="node.parent_id ?? ''" @change="onMoveSelect">
          <option value="">Workspace root</option>
          <option v-for="opt in moveTargets" :key="opt.id" :value="opt.id">{{ opt.title }}</option>
        </select>
        <button
          v-if="node.kind === 'folder'"
          class="ws-manage-btn danger"
          title="Delete folder"
          @click="emit('delete-folder', node.id)"
        >Delete</button>
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
        :manage-mode="manageMode"
        :folder-options="folderOptions"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @add-here="emit('add-here', $event)"
        @rename="emit('rename', $event)"
        @move="emit('move', $event)"
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
  manageMode?: boolean
  folderOptions?: { id: string; title: string }[]
}>()

const emit = defineEmits<{
  select: [node: WorkspaceNode]
  toggle: [id: string]
  'add-here': [folderId: string]
  rename: [node: WorkspaceNode]
  move: [payload: { id: string; parent_id: string | null }]
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

const moveTargets = computed(() =>
  (props.folderOptions ?? []).filter((f) => f.id !== props.node.id),
)

function onMoveSelect(e: Event) {
  const value = (e.target as HTMLSelectElement).value
  emit('move', { id: props.node.id, parent_id: value || null })
}

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
.ws-manage {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
  max-width: 58%;
}
.ws-manage-btn {
  background: #fff;
  border: 1px solid #e4e0d8;
  border-radius: 4px;
  font-size: 11px;
  padding: 1px 6px;
  color: #5c5852;
  cursor: pointer;
}
.ws-manage-btn:hover { background: #f4f1ea; }
.ws-manage-btn.danger { color: #b42318; border-color: #f0c9c4; }
.ws-manage-btn.danger:hover { background: #fff1f0; }
.ws-move {
  max-width: 88px;
  height: 20px;
  font-size: 11px;
  border: 1px solid #e4e0d8;
  border-radius: 4px;
  color: #5c5852;
  background: #fff;
}
.ws-children { padding-left: 16px; }
</style>
