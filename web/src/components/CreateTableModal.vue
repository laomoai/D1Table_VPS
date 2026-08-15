<template>
  <AppModal v-model:show="visible" title="新建表格" @after-enter="focusName">
    <!-- Table Name -->
    <div class="section">
      <label class="label">表格名称</label>
      <input
        ref="nameInputRef"
        v-model="form.displayName"
        class="name-input"
        placeholder="例如：客户、订单、产品…"
        @keyup.enter="handleSubmit"
      />
    </div>

    <!-- Fields -->
    <div class="section">
      <div class="section-head">
        <span class="label">字段</span>
        <span class="hint">id、created_at 会自动添加</span>
      </div>

      <div class="field-list" @click="closeTypePicker">
        <div v-for="(col, idx) in form.columns" :key="idx" class="field-block">
          <div class="field-row">
            <input
              v-model="col.displayName"
              class="col-name-input"
              placeholder="字段名称"
            />
            <!-- Type picker button -->
            <button
              class="type-btn"
              :class="{ open: openTypePicker === idx }"
              @click.stop="toggleTypePicker(idx)"
            >
              <span
                class="type-icon"
                :style="`color: ${TYPE_META[col.fieldType]?.color}`"
              >
                <IonIcon
                  v-if="TYPE_META[col.fieldType]?.icon?.startsWith('ion:')"
                  :name="TYPE_META[col.fieldType]?.icon.slice(4)"
                  :size="14"
                />
                <span v-else>{{ TYPE_META[col.fieldType]?.icon }}</span>
              </span>
              <span class="type-label">{{ TYPE_META[col.fieldType]?.label }}</span>
              <span class="type-arrow">▾</span>
            </button>
            <button
              class="remove-btn"
              :disabled="form.columns.length <= 1"
              @click="removeColumn(idx)"
              title="删除字段"
            >×</button>
          </div>

          <!-- Inline type picker panel -->
          <div v-if="openTypePicker === idx" class="type-picker-panel" @click.stop>
            <button
              v-for="(meta, typeKey) in TYPE_META"
              :key="typeKey"
              class="type-option"
              :class="{ active: col.fieldType === typeKey }"
              @click="selectType(col, typeKey as FieldType)"
            >
              <span class="type-option-icon" :style="`color: ${meta.color}`">
                <IonIcon v-if="meta.icon.startsWith('ion:')" :name="meta.icon.slice(4)" :size="14" />
                <span v-else>{{ meta.icon }}</span>
              </span>
              <span class="type-option-label">{{ meta.label }}</span>
            </button>
          </div>

          <!-- Select options inline -->
          <div v-if="col.fieldType === 'select'" class="select-opts-block">
            <div class="select-opts-title">「{{ col.displayName || '该字段' }}」的选项</div>
            <div v-for="(opt, oi) in col.selectOptions" :key="oi" class="select-opt-row">
              <input
                v-model="opt.label"
                class="opt-input"
                placeholder="选项名称"
                @input="opt.value = opt.label"
              />
              <input v-model="opt.color" type="color" class="color-dot" />
              <button class="remove-btn" @click="col.selectOptions.splice(oi, 1)">×</button>
            </div>
            <button class="add-link-btn" @click="addSelectOption(col)">+ 添加选项</button>
          </div>

          <!-- Link target table selector -->
          <div v-if="col.fieldType === 'link'" class="select-opts-block">
            <div class="select-opts-title">关联表格</div>
            <select :value="col.linkTable ?? ''" @change="(e: Event) => { col.linkTable = (e.target as HTMLSelectElement).value || null; onLinkTableChange(col) }" class="opt-input" style="padding: 6px 8px;">
              <option value="" disabled>选择目标表格…</option>
              <option v-for="t in availableTables" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
            <template v-if="col.linkTable && col.linkTargetFields.length">
              <div class="select-opts-title" style="margin-top: 8px;">显示字段</div>
              <select :value="col.linkDisplayField ?? ''" @change="(e: Event) => col.linkDisplayField = (e.target as HTMLSelectElement).value || null" class="opt-input" style="padding: 6px 8px;">
                <option value="">默认（第一个文本字段）</option>
                <option v-for="f in col.linkTargetFields" :key="f.value" :value="f.value">{{ f.label }}</option>
              </select>
            </template>
          </div>
        </div>
      </div>

      <button class="add-link-btn" @click="addColumn">+ 添加字段</button>
    </div>

    <template #footer>
      <button class="btn-cancel" @click="visible = false">取消</button>
      <button class="btn-create" :disabled="submitting || !form.displayName.trim()" @click="handleSubmit">
        {{ submitting ? '创建中…' : '创建表格' }}
      </button>
    </template>
  </AppModal>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted } from 'vue'
import { useMessage } from 'naive-ui'
import { http, api } from '@/api/client'
import { useQueryClient } from '@tanstack/vue-query'
import type { FieldType, SelectOption } from '@/api/client'
import AppModal from './AppModal.vue'
import IonIcon from './IonIcon.vue'

const visible = defineModel<boolean>('show', { default: false })
const props = defineProps<{ folderId?: string | null }>()
const emit = defineEmits<{ created: [name: string] }>()

const message = useMessage()
const queryClient = useQueryClient()
const nameInputRef = ref<HTMLInputElement>()
const submitting = ref(false)
const openTypePicker = ref<number | null>(null)

// 可选的目标表列表（link 字段用）
const availableTables = ref<Array<{ label: string; value: string }>>([])
onMounted(async () => {
  try {
    const tables = await api.getTables()
    availableTables.value = [
      { label: '笔记', value: '_notes' },
      ...tables.map(t => ({ label: t.title || t.name, value: t.name })),
    ]
  } catch {}
})

interface ColDef {
  displayName: string
  fieldType: FieldType
  type: string
  selectOptions: SelectOption[]
  linkTable: string | null
  linkDisplayField: string | null
  linkTargetFields: Array<{ label: string; value: string }>
}

const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  text:     { label: '文本',      icon: 'T',  color: '#787774' },
  longtext: { label: '长文本', icon: '¶',  color: '#a3a19d' },
  number:   { label: '数字',    icon: '#',  color: '#4f6ef7' },
  currency: { label: '货币',  icon: '¥',  color: '#18a058' },
  percent:  { label: '百分比',   icon: '%',  color: '#f0a020' },
  email:    { label: '邮箱',     icon: '@',  color: '#00adb5' },
  url:      { label: '链接',       icon: 'ion:LinkOutline', color: '#4f6ef7' },
  date:     { label: '日期',      icon: 'ion:CalendarOutline', color: '#8a2be2' },
  datetime: { label: '日期时间',  icon: 'ion:TimeOutline', color: '#d03050' },
  checkbox: { label: '勾选',  icon: 'ion:CheckboxOutline',  color: '#18a058' },
  select:   { label: '单选',    icon: 'ion:OptionsOutline',  color: '#f0a020' },
  image:    { label: '图片',     icon: 'ion:ImageOutline', color: '#e91e8c' },
  link:     { label: '关联',      icon: 'ion:LinkOutline', color: '#4f6ef7' },
  totp:     { label: '动态口令',       icon: 'ion:KeyOutline', color: '#d03050' },
  password: { label: '密码',  icon: 'ion:LockClosedOutline', color: '#8a6d3b' },
}

const fieldTypeToSqlite: Record<string, string> = {
  text: 'TEXT', longtext: 'TEXT', email: 'TEXT', url: 'TEXT', select: 'TEXT', image: 'TEXT',
  link: 'TEXT', totp: 'TEXT', password: 'TEXT',
  number: 'REAL', currency: 'REAL', percent: 'REAL',
  date: 'TEXT', datetime: 'INTEGER',
  checkbox: 'INTEGER',
}

function generateTableName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 8; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `tbl_${id}`
}

function generateColName(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 4; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `col_${id}`
}

function syncSqliteType(col: ColDef) {
  col.type = fieldTypeToSqlite[col.fieldType] ?? 'TEXT'
}

function toggleTypePicker(idx: number) {
  openTypePicker.value = openTypePicker.value === idx ? null : idx
}

function closeTypePicker() {
  openTypePicker.value = null
}

function selectType(col: ColDef, typeKey: FieldType) {
  col.fieldType = typeKey
  syncSqliteType(col)
  openTypePicker.value = null
}

async function onLinkTableChange(col: ColDef) {
  col.linkDisplayField = null
  col.linkTargetFields = []
  if (!col.linkTable || col.linkTable === '_notes') return
  try {
    const fields = await api.getFieldMeta(col.linkTable)
    col.linkTargetFields = fields
      .filter(f => !['id', 'created_at'].includes(f.column_name))
      .map(f => ({ label: f.title, value: f.column_name }))
  } catch {}
}

interface FormData {
  displayName: string
  columns: ColDef[]
}

function defaultForm(): FormData {
  return {
    displayName: '',
    columns: [
      { displayName: 'Name', fieldType: 'text' as FieldType, type: 'TEXT', selectOptions: [], linkTable: null, linkDisplayField: null, linkTargetFields: [] },
    ],
  }
}

const form = ref<FormData>(defaultForm())

function focusName() {
  nextTick(() => nameInputRef.value?.focus())
}

function addColumn() {
  form.value.columns.push({ displayName: '', fieldType: 'text', type: 'TEXT', selectOptions: [], linkTable: null, linkDisplayField: null, linkTargetFields: [] })
}

function removeColumn(idx: number) {
  form.value.columns.splice(idx, 1)
}

function generateOptId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let id = ''
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return `opt_${id}`
}

function addSelectOption(col: ColDef) {
  const colors = ['#4f6ef7', '#18a058', '#f0a020', '#d03050', '#8a2be2', '#00ced1']
  col.selectOptions.push({ id: generateOptId(), value: '', label: '', color: colors[col.selectOptions.length % colors.length] })
}

async function handleSubmit() {
  if (!form.value.displayName.trim()) {
    nameInputRef.value?.focus()
    return
  }

  const cols = form.value.columns.filter(c => c.displayName.trim())
  if (cols.length === 0) {
    message.warning('请至少添加一个字段')
    return
  }

  // 校验 link 字段必须选择目标表
  const missingLink = cols.find(c => c.fieldType === 'link' && !c.linkTable?.trim())
  if (missingLink) {
    message.warning(`请为关联字段「${missingLink.displayName}」选择目标表格`)
    return
  }

  const tableName = generateTableName()
  submitting.value = true
  try {
    await http.post('/tables', {
      name: tableName,
      title: form.value.displayName.trim(),
      folder_id: props.folderId ?? undefined,
      columns: cols.map(c => ({
        name: generateColName(),
        title: c.displayName.trim(),
        type: c.type,
        field_type: c.fieldType,
        nullable: true,
        select_options: c.fieldType === 'select' ? c.selectOptions : undefined,
        link_table: c.fieldType === 'link' ? c.linkTable ?? undefined : undefined,
        link_display_field: c.fieldType === 'link' ? c.linkDisplayField ?? undefined : undefined,
      })),
    })
    message.success(`「${form.value.displayName}」已创建`)
    await queryClient.invalidateQueries({ queryKey: ['tables'] })
    await queryClient.invalidateQueries({ queryKey: ['workspace'] })
    await queryClient.refetchQueries({ queryKey: ['tables'] })
    emit('created', tableName)
    visible.value = false
    form.value = defaultForm()
  } catch (err) {
    message.error((err as Error).message)
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.section { display: flex; flex-direction: column; gap: 8px; }

.section-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.label {
  font-size: 13px;
  font-weight: 600;
  color: #37352f;
}
.hint {
  font-size: 12px;
  color: #a3a19d;
}

.name-input {
  width: 100%;
  box-sizing: border-box;
  padding: 8px 10px;
  font-size: 15px;
  color: #37352f;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  outline: none;
  transition: border-color 0.12s;
  font-family: inherit;
  background: #fff;
}
.name-input:focus { border-color: #b3b0ab; }
.name-input::placeholder { color: #a3a19d; }

.field-list { display: flex; flex-direction: column; gap: 4px; }
.field-block { display: flex; flex-direction: column; gap: 0; }

.field-row {
  display: grid;
  grid-template-columns: 1fr auto 28px;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}

.col-name-input {
  min-width: 0;
  padding: 6px 8px;
  font-size: 13px;
  color: #37352f;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  outline: none;
  font-family: inherit;
  background: #fff;
  transition: border-color 0.12s;
}
.col-name-input:focus { border-color: #b3b0ab; }
.col-name-input::placeholder { color: #a3a19d; }

.type-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  background: #fff;
  cursor: pointer;
  font-family: inherit;
  font-size: 13px;
  color: #37352f;
  white-space: nowrap;
  min-width: 130px;
  transition: border-color 0.12s, background 0.12s;
}
.type-btn:hover, .type-btn.open { border-color: #b3b0ab; background: #f7f7f5; }
.type-icon { font-size: 12px; font-weight: 700; flex-shrink: 0; width: 16px; text-align: center; }
.type-label { flex: 1; }
.type-arrow { font-size: 10px; color: #a3a19d; flex-shrink: 0; }

.type-picker-panel {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
  padding: 10px;
  background: #fff;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  margin-top: 4px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
}

.type-option {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 3px;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: 12px;
  color: #37352f;
  text-align: left;
  transition: background 0.1s, border-color 0.1s;
}
.type-option:hover { background: rgba(55,53,47,0.06); }
.type-option.active { background: rgba(55,53,47,0.08); border-color: #b3b0ab; }
.type-option-icon { font-size: 12px; font-weight: 700; flex-shrink: 0; width: 14px; text-align: center; }
.type-option-label { white-space: nowrap; }

.remove-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #a3a19d;
  cursor: pointer;
  padding: 0 3px;
  border-radius: 3px;
  line-height: 1;
  flex-shrink: 0;
  transition: color 0.12s, background 0.12s;
}
.remove-btn:hover:not(:disabled) { color: #eb5757; background: #fdf2f2; }
.remove-btn:disabled { opacity: 0.3; cursor: default; }

.select-opts-block {
  background: #f7f7f5;
  border: 1px solid #e9e9e7;
  border-radius: 4px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}
.select-opts-title { font-size: 12px; color: #787774; font-weight: 500; }
.select-opt-row { display: flex; align-items: center; gap: 8px; }
.opt-input {
  flex: 1;
  padding: 4px 8px;
  font-size: 13px;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  outline: none;
  color: #37352f;
  font-family: inherit;
}
.opt-input:focus { border-color: #b3b0ab; }
.color-dot {
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  padding: 0;
  flex-shrink: 0;
}

.add-link-btn {
  background: none;
  border: none;
  font-size: 13px;
  color: #787774;
  cursor: pointer;
  padding: 4px 0;
  text-align: left;
  transition: color 0.12s;
}
.add-link-btn:hover { color: #37352f; }

.btn-cancel {
  background: none;
  border: 1px solid #e9e9e7;
  border-radius: 3px;
  padding: 6px 16px;
  font-size: 14px;
  color: #787774;
  cursor: pointer;
  font-family: inherit;
  transition: border-color 0.12s, color 0.12s;
}
.btn-cancel:hover { border-color: #b3b0ab; color: #37352f; }
.btn-create {
  background: #37352f;
  color: #fff;
  border: none;
  border-radius: 3px;
  padding: 6px 16px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s;
}
.btn-create:hover:not(:disabled) { background: #2f2d28; }
.btn-create:disabled { opacity: 0.4; cursor: default; }
</style>
