import { useQueryCache } from '@pinia/colada'
import { bootErrorFrom } from '~/api/client'
import { consumePendingSessionEnd } from '~/auth/session-events'
import { loadAuthConfig, resolveSession, useLogout } from '~/queries/session'
import { safeAppRedirect, type BootError } from '~/utils/session-lifecycle'

// Feature logic for the boot screen shown when the stored session could not be loaded (the
// API did not answer, or answered in a way that neither confirms nor refuses the session).
// The tokens are still stored: Retry resolves the session again and continues to the page the
// admin opened; Sign out ends it on this device and opens the sign-in page.
export function useBootRecovery() {
  const bootError = useState<BootError | null>('app:boot-error', () => null)
  const queryCache = useQueryCache()
  const logout = useLogout()
  // The router's own current route: useRoute() only syncs when a page renders, and no page
  // renders while this screen is up.
  const router = useRouter()
  const retrying = ref(false)
  const signingOut = ref(false)
  // An outage reads differently from an answer that points at the configuration.
  const title = computed(() => bootError.value?.transient === false ? 'Can\'t load your session' : 'Can\'t reach the auth API')
  const icon = computed(() => bootError.value?.transient === false ? 'i-lucide-circle-alert' : 'i-lucide-cloud-off')

  async function retry() {
    if (retrying.value || signingOut.value) return
    retrying.value = true
    try {
      const result = await resolveSession(queryCache, loadAuthConfig(queryCache))
      if (result.status === 'unreachable') {
        bootError.value = bootErrorFrom(result.error)
        return
      }
      bootError.value = null
      // The guard parked the requested page on ?redirect while the session was unknown.
      const current = router.currentRoute.value
      const redirect = safeAppRedirect(current.query.redirect)
      if (result.status === 'signed-in') {
        await navigateTo(redirect ?? '/app/dashboard', { replace: true })
        return
      }
      // A renewal refused during the retry ended the session. The session-sync plugin does not
      // route from the sign-in page it is already on, so the reason travels on this navigation.
      const reason = consumePendingSessionEnd()
      await navigateTo(
        reason ? { path: '/auth/login', query: { reason, ...(redirect ? { redirect } : {}) } } : current.fullPath,
        { replace: true }
      )
    } finally {
      retrying.value = false
    }
  }

  // Local-first like every sign-out: the tokens and cache go now, and the server-side
  // revocation is attempted in the background (it may fail while the API is unreachable).
  async function signOut() {
    if (signingOut.value) return
    signingOut.value = true
    try {
      await logout.mutateAsync()
      bootError.value = null
      await navigateTo('/auth/login', { replace: true })
    } finally {
      signingOut.value = false
    }
  }

  return { bootError, title, icon, retrying, retry, signingOut, signOut }
}
