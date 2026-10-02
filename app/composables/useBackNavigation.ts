import type { MaybeRefOrGetter } from 'vue'
import { backLinkLabel, historyBackTarget } from '~/utils/navigation'

// History-aware back link for detail pages (F-216). When the previous history entry is another
// console page, Back is the browser's back: an entity -> member -> Back returns to the entity,
// with its scroll position and focus restored by the shell. On a deep link, a new tab or after
// arriving from outside the console, the link falls back to the list route. The link keeps a
// real href (the destination), so opening it in a new tab still works.
export function useBackNavigation(fallback: MaybeRefOrGetter<string>, fallbackLabel: MaybeRefOrGetter<string>) {
  const router = useRouter()
  const route = useRoute()

  // history.state is not reactive. Read it once the page is mounted (after vue-router wrote the
  // entry for this navigation) and again after every navigation that keeps this page mounted (a
  // query-driven tab or filter): each one writes a new entry whose `back` is this same record,
  // which historyBackTarget then refuses, so Back leaves for the list instead of stepping
  // through the record's own states. useRoute() in a page is that page's route, so leaving for
  // another page does not re-read here.
  const historyTarget = ref<string | null>(null)
  const readHistory = () => {
    historyTarget.value = historyBackTarget(window.history.state, route.fullPath)
  }
  onMounted(readHistory)
  watch(() => route.fullPath, readHistory, { flush: 'post' })

  const href = computed(() => historyTarget.value ?? toValue(fallback))
  const label = computed(() => backLinkLabel(historyTarget.value, toValue(fallbackLabel)))

  function onClick(event: MouseEvent) {
    // Let modified clicks (new tab/window) and anything already handled use the href.
    if (!historyTarget.value || event.defaultPrevented || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    router.back()
  }

  return { href, label, onClick }
}
