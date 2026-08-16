const KEY = 'mowen_recent_access'

export type RecentKind = 'table' | 'note'

export type RecentEntry = {
  kind: RecentKind
  id: string
  at: number
}

export function loadRecentAccess(): RecentEntry[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    if (!Array.isArray(raw)) return []
    return raw.filter((x) => x && (x.kind === 'table' || x.kind === 'note') && x.id && x.at)
  } catch {
    return []
  }
}

export function trackRecentAccess(kind: RecentKind, id: string): void {
  if (!id) return
  const next = loadRecentAccess().filter((x) => !(x.kind === kind && x.id === id))
  next.unshift({ kind, id, at: Date.now() })
  localStorage.setItem(KEY, JSON.stringify(next.slice(0, 40)))
}

export function formatRecentTime(ts: number): string {
  return new Date(ts).toLocaleDateString()
}
