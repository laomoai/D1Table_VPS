import { onMounted, onUnmounted, ref } from 'vue'

async function probe(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false
  const ctrl = new AbortController()
  const timer = window.setTimeout(() => ctrl.abort(), 4000)
  try {
    const res = await fetch('/api/health', { cache: 'no-store', signal: ctrl.signal })
    return res.ok
  } catch {
    return false
  } finally {
    window.clearTimeout(timer)
  }
}

export function useNetwork() {
  const online = ref(typeof navigator === 'undefined' ? true : navigator.onLine)
  const reachable = ref(true)
  let timer: number | null = null

  async function refresh() {
    online.value = navigator.onLine
    if (!navigator.onLine) {
      reachable.value = false
      return
    }
    reachable.value = await probe()
  }

  function onOnline() { void refresh() }
  function onOffline() {
    online.value = false
    reachable.value = false
  }

  onMounted(() => {
    void refresh()
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    timer = window.setInterval(() => { void refresh() }, 15000)
  })
  onUnmounted(() => {
    window.removeEventListener('online', onOnline)
    window.removeEventListener('offline', onOffline)
    if (timer != null) window.clearInterval(timer)
  })

  return { online, reachable }
}
