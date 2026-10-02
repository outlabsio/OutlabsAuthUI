import { useQueryCache } from '@pinia/colada'
import { consumePendingSessionEnd, onSessionEnded } from '~/auth/session-events'
import {
  getStoredAccessToken,
  hasStoredAuthTokens,
  isAccessTokenStorageKey,
  isAuthTokenStorageKey,
  readSessionEndMarker,
  tokensPresent
} from '~/auth/tokens'
import { releaseUnloadWarnings } from '~/composables/useDialogGuard'
import { SESSION_KEY, clearSessionCache, fetchSessionUser, resolveSession } from '~/queries/session'
import type { SessionUser } from '~/types/auth'
import { readJwtSubject, safeAppRedirect, type SessionEndReason } from '~/utils/session-lifecycle'

// Keeps this tab's session state in step with reality after boot:
// - a session ended by the API client (refused renewal) drops every cached response and lands
//   on sign-in with the reason and a way back to the page the admin was on;
// - other tabs share the tokens through localStorage, so their sign-in, sign-out and identity
//   switches are mirrored here (a plain token rotation needs nothing).

const isAppPath = (path: string) => path === '/app' || path.startsWith('/app/')

export default defineNuxtPlugin(() => {
  const configError = useState('app:config-error')
  if (configError.value) return

  const queryCache = useQueryCache()
  const router = useRouter()

  function toSignIn(reason: SessionEndReason) {
    const current = router.currentRoute.value
    if (!isAppPath(current.path)) return false
    void router.replace({ path: '/auth/login', query: { reason, redirect: current.fullPath } })
    return true
  }

  onSessionEnded(({ reason }) => {
    clearSessionCache(queryCache)
    // Before the first navigation the auth guard carries the reason on its own redirect.
    if (toSignIn(reason)) consumePendingSessionEnd()
  })

  // `previousAccessToken`: the access token this tab saw before the burst of changes (the
  // storage event's oldValue), undefined when the burst did not report it.
  async function syncFromStorage(previousAccessToken: string | null | undefined) {
    const present = hasStoredAuthTokens()
    tokensPresent.value = present
    const cachedUser = queryCache.getQueryData<SessionUser | null>(SESSION_KEY) ?? null

    if (!present) {
      // Signed out (or expired) in another tab.
      if (!cachedUser) return
      clearSessionCache(queryCache)
      toSignIn(readSessionEndMarker() ?? 'signed_out')
      return
    }

    if (cachedUser) {
      // Tokens changed elsewhere while this tab is signed in: a rotation (same subject, nothing
      // to do) or a different identity. Opaque tokens are identified through /users/me. The
      // account this tab was signed in as is the subject of the token it held before the change
      // as well as the cached user: a refetch of /users/me that ran meanwhile with the new
      // tokens can already have cached the new account.
      const subject = readJwtSubject(getStoredAccessToken())
        ?? await fetchSessionUser().then(user => user.id, () => null)
      const previousSubject = readJwtSubject(previousAccessToken)
      if (subject == null || (subject === cachedUser.id && (previousSubject == null || subject === previousSubject))) return
      // A different identity now owns the shared tokens. Reload into it so nothing from the
      // previous actor survives in memory. Nothing may cancel that reload: an open dialog's
      // "Leave site?" prompt would let the user stay and save the previous account's dialog
      // with the new account's session.
      clearSessionCache(queryCache)
      releaseUnloadWarnings()
      window.location.assign('/app/dashboard')
      return
    }

    // Signed in in another tab while this one was signed out.
    const result = await resolveSession(queryCache)
    const current = router.currentRoute.value
    if (result.status === 'signed-in' && current.path === '/auth/login') {
      await router.replace(safeAppRedirect(current.query.redirect) ?? '/app/dashboard')
    }
  }

  // Both token keys change per write; settle once per burst, remembering the access token the
  // burst started from.
  let timer: ReturnType<typeof setTimeout> | undefined
  let burstStartedFrom: { accessToken: string | null } | undefined
  window.addEventListener('storage', (event) => {
    if (event.storageArea !== window.localStorage) return
    if (event.key !== null && !isAuthTokenStorageKey(event.key)) return
    if (!burstStartedFrom && isAccessTokenStorageKey(event.key)) burstStartedFrom = { accessToken: event.oldValue }
    clearTimeout(timer)
    timer = setTimeout(() => {
      const previous = burstStartedFrom?.accessToken
      burstStartedFrom = undefined
      void syncFromStorage(previous)
    }, 50)
  })
})
