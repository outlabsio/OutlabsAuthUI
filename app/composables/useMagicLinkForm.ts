import { useVerifyMagicLink, useLogout } from '~/queries/session'
import { magicLinkFailure, type MagicLinkFailure } from '~/utils/auth-messages'
import { getRuntimeConfig } from '~/utils/runtime-config'

// Magic-link landing (/auth/magic-link?token=…). The link is used only when the person clicks
// "Continue signing in": mail scanners that open links (and run their scripts) must not burn a
// single-use token before its owner gets to it. A browser already signed in (as anyone) is
// asked before switching accounts. Success opens the challenge's server-validated next_url,
// else ?redirect, else the dashboard. Failures explain themselves: an expired, used or invalid
// link offers a new one (sign-in, opened on the email form); a network or rate-limit failure
// (link not consumed) offers a retry.
// Without a token the page is skipped (route middleware on the page).

export type MagicLinkState = 'ready' | 'signed-in' | 'verifying' | 'failed'

export function useMagicLinkForm() {
  const route = useRoute()
  const { run } = useApiAction()
  const { user } = useAuth()
  const { destination, withIntent } = useAuthIntent()
  const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''))

  const verifyMagicLink = useVerifyMagicLink()
  const logout = useLogout()
  const verifying = ref(false)
  const signingOut = ref(false)
  const failure = ref<MagicLinkFailure | null>(null)
  const signedInAs = computed(() => user.value?.email ?? '')

  const state = computed<MagicLinkState>(() => {
    if (verifying.value) return 'verifying'
    if (failure.value) return 'failed'
    return signedInAs.value ? 'signed-in' : 'ready'
  })
  useAuthStepFocus(state, { skip: next => next === 'verifying' })

  async function continueSignIn() {
    if (!token.value || verifying.value) return
    verifying.value = true
    failure.value = null
    // Deliberate exception to "every mutation goes through useApiAction": a failed link is
    // this page's main content (an inline state per failure kind: expired, used, wrong
    // application), not a toast, so the error is caught here. Like the OAuth callback, this is
    // a landing page's own verify step; ordinary forms and actions keep using run(). The
    // exception list lives in ARCHITECTURE.md ("Cross-cutting side effects").
    try {
      const { nextUrl } = await verifyMagicLink.mutateAsync({ token: token.value })
      await navigateTo(destination(nextUrl), { replace: true })
    } catch (error) {
      failure.value = magicLinkFailure(error, getRuntimeConfig().frontendProfileKey)
    } finally {
      verifying.value = false
    }
  }

  // The link belongs to whoever received it: end this browser's session first, then use it.
  // A sign-out that fails leaves the prompt in place (with a toast) rather than using the link
  // under the wrong account.
  async function signOutAndContinue() {
    if (signingOut.value) return
    signingOut.value = true
    const res = await run(() => logout.mutateAsync(), { error: 'Could not sign out' })
    signingOut.value = false
    if (res.ok) await continueSignIn()
  }

  // "Request a new link" opens sign-in on the email form (where "Email me a magic link instead"
  // lives); "Back to sign in" opens the method buttons. Both keep ?redirect.
  const newLinkTo = computed(() => withIntent('/auth/login', { method: 'email' }))
  const signInTo = computed(() => withIntent('/auth/login'))

  return { state, signedInAs, signingOut, failure, continueSignIn, signOutAndContinue, newLinkTo, signInTo }
}
