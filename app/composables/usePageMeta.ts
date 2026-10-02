import type { MaybeRefOrGetter } from 'vue'
import { composePageTitle, routeFallbackTitle } from '~/utils/page-title'

// Per-route document title (F-130). app.vue already titles every route from its section
// (APP_SECTIONS) or guest page and applies the "· <app name>" template, so section pages need
// nothing. Record pages call this with the record's name, e.g.
//   usePageMeta(() => role.value?.display_name)
// which yields "<record> · <section> · <app name>" once loaded and the section alone before.
// The route announcer reads the resulting title after each navigation.
export function usePageMeta(record?: MaybeRefOrGetter<string | null | undefined>) {
  const route = useRoute()
  useHead({
    title: () => composePageTitle(toValue(record), routeFallbackTitle(route.path))
  })
}
