import { useLogout } from '~/queries/session'

// The console's sign-out action, shared by every shell entry point (the user menu and the
// command palette) so they cannot drift apart: end the session on this device (useLogout —
// tokens and cached responses go first, the server-side revocation runs in the background) and
// open the sign-in page. A second call while one is running is ignored. The boot-recovery
// screen keeps its own flow (it also clears the boot error and replaces the parked route).
export function useSignOut() {
  const logout = useLogout()
  const signingOut = ref(false)

  async function signOut() {
    if (signingOut.value) return
    signingOut.value = true
    try {
      await logout.mutateAsync()
      await navigateTo('/auth/login')
    } finally {
      signingOut.value = false
    }
  }

  return { signOut, signingOut: readonly(signingOut) }
}
