import type { QueryClient } from '@tanstack/vue-query'
import type { Router } from 'vue-router'
import type { WorkspaceNode } from '@/api/client'

export async function refreshWorkspace(queryClient: QueryClient) {
  await queryClient.refetchQueries({ queryKey: ['workspace'] })
  queryClient.invalidateQueries({ queryKey: ['tables'] })
  queryClient.invalidateQueries({ queryKey: ['notes'] })
  queryClient.invalidateQueries({ queryKey: ['groups'] })
}

function parseRef(id: string, prefix: string): string {
  const raw = id.includes('::') ? id.slice(0, id.indexOf('::')) : id
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : ''
}

export function leafPath(node: WorkspaceNode): string | null {
  if (node.kind === 'table') {
    const ref = node.ref || parseRef(node.id, 'wn_t_')
    return ref ? `/tables/${ref}` : null
  }
  if (node.kind === 'note') {
    const ref = node.ref || parseRef(node.id, 'wn_n_')
    return ref ? `/notes/${ref}` : null
  }
  return null
}

export function openWorkspaceNode(router: Router, node: WorkspaceNode) {
  const path = leafPath(node)
  if (!path) return
  if (router.currentRoute.value.path !== path) {
    router.push(path)
  }
}
