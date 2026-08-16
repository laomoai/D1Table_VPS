import { onMounted, onUnmounted, ref } from 'vue'

const QUERY = '(max-width: 880px)'

export function useNarrow() {
  const narrow = ref(typeof window !== 'undefined' ? window.matchMedia(QUERY).matches : false)
  let mq: MediaQueryList | null = null
  const apply = () => {
    if (mq) narrow.value = mq.matches
  }

  onMounted(() => {
    mq = window.matchMedia(QUERY)
    apply()
    mq.addEventListener('change', apply)
  })
  onUnmounted(() => mq?.removeEventListener('change', apply))

  return narrow
}
