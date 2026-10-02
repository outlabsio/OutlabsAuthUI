import { rememberPanels, trackShownEntry } from '~/navigation/panel-memory'
import { isAppPath } from '~/utils/navigation'

// Records scroll and focus of the console page being left (F-217); router.options.ts restores
// them when Back/Forward returns to it. See app/navigation/panel-memory.ts.
export default defineNuxtPlugin(() => {
  const router = useRouter()

  router.beforeEach((to, from) => {
    if (!from.matched.length || !isAppPath(from.path) || to.fullPath === from.fullPath) return
    rememberPanels(from.fullPath, to.fullPath)
  })

  router.afterEach((_to, _from, failure) => {
    if (!failure) trackShownEntry()
  })
})
