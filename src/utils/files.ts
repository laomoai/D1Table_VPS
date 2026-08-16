import { createHmac, timingSafeEqual } from 'node:crypto'
import type { SqliteDatabase } from '../db/sqlite'
import { getAccessibleNoteIds, canAccessNote } from './note-access'

export type FileRefKind = 'table' | 'note' | 'none'

export type FileMeta = {
  storage_key: string
  owner_id: number | null
  team_id: number | null
  ref_kind: FileRefKind
  ref_id: string | null
}

export function normalizeStorageKey(raw: string): string | null {
  const key = decodeURIComponent(raw).replace(/^\/+/, '').replace(/\0/g, '')
  if (!key || key.includes('..') || key.length > 240) return null
  return key
}

export async function registerFile(
  db: SqliteDatabase,
  opts: {
    storageKey: string
    ownerId?: number | null
    teamId?: number | null
    refKind?: FileRefKind
    refId?: string | null
  },
): Promise<void> {
  await db.prepare(
    `INSERT OR REPLACE INTO _files (storage_key, owner_id, team_id, ref_kind, ref_id, created_at)
     VALUES (?, ?, ?, ?, ?, unixepoch())`,
  ).bind(
    opts.storageKey,
    opts.ownerId ?? null,
    opts.teamId ?? null,
    opts.refKind ?? 'none',
    opts.refId ?? null,
  ).run()
}

export async function getFileMeta(db: SqliteDatabase, key: string): Promise<FileMeta | null> {
  return db.prepare(
    `SELECT storage_key, owner_id, team_id, ref_kind, ref_id FROM _files WHERE storage_key = ?`,
  ).bind(key).first<FileMeta>()
}

export function signFileUrl(secret: string, key: string, ttlSec = 3600): { exp: number; sig: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  const sig = createHmac('sha256', secret).update(`${key}\n${exp}`).digest('hex')
  return { exp, sig }
}

export function verifyFileSig(secret: string, key: string, expRaw: string, sig: string): boolean {
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false
  if (!/^[0-9a-f]{64}$/i.test(sig)) return false
  const expected = createHmac('sha256', secret).update(`${key}\n${exp}`).digest()
  const got = Buffer.from(sig, 'hex')
  if (got.length !== expected.length) return false
  return timingSafeEqual(got, expected)
}

export async function canReadStoredFile(
  db: SqliteDatabase,
  meta: FileMeta | null,
  access: {
    userId?: number
    teamId?: number
    allowedTables: string[] | null
    allowedNoteRootIds: string[] | null
    isAdminKey?: boolean
  },
): Promise<boolean> {
  if (access.isAdminKey) return true
  if (!meta) return true
  if (meta.team_id != null && access.teamId != null && meta.team_id !== access.teamId) return false

  if (meta.ref_kind === 'table' && meta.ref_id) {
    if (access.allowedTables === null) return true
    return access.allowedTables.includes(meta.ref_id)
  }
  if (meta.ref_kind === 'note' && meta.ref_id) {
    const allowed = await getAccessibleNoteIds(db, access.teamId, access.allowedNoteRootIds)
    return canAccessNote(allowed, meta.ref_id)
  }
  if (meta.owner_id != null && access.userId != null) return meta.owner_id === access.userId
  return true
}
