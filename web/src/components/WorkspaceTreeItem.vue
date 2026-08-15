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
        menuOpen: menuOpen,
      }"
      draggable="true"
      @click="onClick"
      @contextmenu.prevent="openMenu"
      @dragstart="onDragStart"
      @dragend="onDragEnd"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <span class="ws-drag-handle" title="Drag to move">⋮⋮</span>
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
        <HoverTooltipText :text="node.title || '未命名'" class-name="ws-title" />
      </span>
      <div class="ws-actions" @click.stop>
        <button class="ws-action-btn more" title="更多" @click="openMenu">•••</button>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="menuOpen"
        class="ws-menu"
        :style="menuStyle"
        @mousedown.stop
      >
          <template v-if="node.kind === 'folder'">
            <div class="ws-menu-item has-sub" @mouseenter="showAdd = true" @mouseleave="showAdd = false">
              <span>添加</span>
              <span class="ws-caret">›</span>
              <div v-if="showAdd" class="ws-submenu">
                <button class="ws-menu-item" @click="onAdd('folder')">文件夹</button>
                <button class="ws-menu-item" @click="onAdd('table')">表格</button>
                <button class="ws-menu-item" @click="onAdd('note')">笔记</button>
              </div>
            </div>
            <button class="ws-menu-item" @click="onRename">重命名</button>
          </template>
          <div class="ws-menu-item has-sub" @mouseenter="showMove = true" @mouseleave="showMove = false">
            <span>移动到</span>
            <span class="ws-caret">›</span>
            <div v-if="showMove" class="ws-submenu">
              <button class="ws-menu-item" @click="onMove(null)">工作区根目录</button>
              <button
                v-for="opt in moveTargets"
                :key="opt.id"
                class="ws-menu-item"
                @click="onMove(opt.id)"
              >{{ opt.title }}</button>
              <div v-if="moveTargets.length === 0" class="ws-menu-empty">没有其他文件夹</div>
            </div>
          </div>
          <template v-if="node.kind === 'folder'">
            <div class="ws-menu-sep" />
            <button class="ws-menu-item" @click="onArchive">归档整个文件夹</button>
            <button class="ws-menu-item danger" @click="onDelete">删除</button>
          </template>
      </div>
    </Teleport>

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
        :folder-options="folderOptions"
        @select="emit('select', $event)"
        @toggle="emit('toggle', $event)"
        @add-here="emit('add-here', $event)"
        @add-in="emit('add-in', $event)"
        @rename="emit('rename', $event)"
        @move="emit('move', $event)"
        @delete-folder="emit('delete-folder', $event)"
        @archive="emit('archive', $event)"
        @reorder="emit('reorder', $event)"
        @update:drop-state="emit('update:drop-state', $event)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
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
  folderOptions?: { id: string; title: string }[]
}>()

const emit = defineEmits<{
  select: [node: WorkspaceNode]
  toggle: [id: string]
  'add-here': [folderId: string]
  'add-in': [payload: { folderId: string; kind: 'folder' | 'table' | 'note' }]
  rename: [node: WorkspaceNode]
  move: [payload: { id: string; parent_id: string | null }]
  'delete-folder': [id: string]
  archive: [node: WorkspaceNode]
  reorder: [payload: { dragId: string; dropId: string; mode: 'above' | 'child' }]
  'update:drop-state': [state: { id: string | null; position: 'above' | 'child' | null }]
}>()

const menuOpen = ref(false)
const showAdd = ref(false)
const showMove = ref(false)
const menuPos = ref({ x: 0, y: 0 })

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
const menuStyle = computed(() => ({
  left: `${menuPos.value.x}px`,
  top: `${menuPos.value.y}px`,
}))

function onMenuPointerDown(e: PointerEvent) {
  const el = e.target as Element | null
  if (menuOpen.value && el && !el.closest('.ws-menu')) {
    menuOpen.value = false
  }
}

function openMenu(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  const x = Math.min(e.clientX, window.innerWidth - 200)
  const y = Math.min(e.clientY, window.innerHeight - 180)
  menuPos.value = { x, y }
  showMove.value = false
  showAdd.value = false
  menuOpen.value = true
  document.addEventListener('pointerdown', onMenuPointerDown, true)
}

function closeMenu() {
  menuOpen.value = false
  document.removeEventListener('pointerdown', onMenuPointerDown, true)
}

onUnmounted(closeMenu)

function onAdd(kind: 'folder' | 'table' | 'note') {
  closeMenu()
  emit('add-in', { folderId: props.node.id, kind })
}

function onRename() {
  closeMenu()
  emit('rename', props.node)
}

function onMove(parentId: string | null) {
  closeMenu()
  emit('move', { id: props.node.id, parent_id: parentId })
}

function onDelete() {
  closeMenu()
  emit('delete-folder', props.node.id)
}

function onArchive() {
  closeMenu()
  emit('archive', props.node)
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
.ws-item:hover,
.ws-item.menuOpen { background: rgba(55, 53, 47, 0.06); }
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
.ws-item:hover .ws-drag-handle,
.ws-item.menuOpen .ws-drag-handle { color: #c4c4c0; }
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
.ws-actions {
  display: none;
  gap: 2px;
  flex-shrink: 0;
}
.ws-item:hover .ws-actions,
.ws-item.menuOpen .ws-actions { display: flex; }
.ws-action-btn {
  background: none; border: none;
  padding: 0 4px; font-size: 13px;
  color: #a3a19d; cursor: pointer;
  border-radius: 3px; line-height: 1.4;
}
.ws-action-btn.more { letter-spacing: 0.5px; font-size: 11px; }
.ws-action-btn:hover { color: #37352f; background: rgba(55,53,47,0.08); }
.ws-children { padding-left: 16px; }
</style>

<style>
.ws-menu {
  position: fixed;
  z-index: 4100;
  min-width: 168px;
  padding: 4px;
  background: #fff;
  border: 1px solid #eceae4;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(30, 28, 24, 0.14);
}
.ws-submenu {
  position: absolute;
  left: calc(100% - 4px);
  top: -4px;
  min-width: 168px;
  max-height: 240px;
  overflow: auto;
  padding: 4px;
  background: #fff;
  border: 1px solid #eceae4;
  border-radius: 8px;
  box-shadow: 0 10px 30px rgba(30, 28, 24, 0.14);
}
.ws-menu-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  border: 0;
  background: none;
  text-align: left;
  padding: 7px 10px;
  font-size: 13px;
  color: #2c2a26;
  border-radius: 5px;
  cursor: pointer;
}
.ws-menu-item:hover,
.ws-menu-item.has-sub:hover { background: #f4f1ea; }
.ws-menu-item.danger { color: #b42318; }
.ws-menu-item.danger:hover { background: #fff1f0; }
.ws-caret { color: #b0aaa2; font-size: 12px; }
.ws-menu-sep { height: 1px; background: #efece6; margin: 4px 6px; }
.ws-menu-empty { padding: 8px 10px; font-size: 12px; color: #9a968e; }
</style>
