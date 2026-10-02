import { useQuery } from '@pinia/colada'
import { getApiOrigin, isTransientApiError } from '~/api/client'
import { authConfigQuery } from '~/queries/session'
import { isSessionEndReason, type SessionEndReason } from '~/utils/session-lifecycle'

// Guest-surface notices: why the admin landed on sign-in (a forced session end carries
// ?reason=), and whether the auth API can be reached at all.

type Notice = {
  title: string
  description: string
  color: 'warning' | 'error' | 'info' | 'neutral'
  icon: string
}

const SESSION_END_NOTICES: Record<SessionEndReason, Notice> = {
  expired: {
    title: 'Your session expired',
    description: 'Sign in again to continue where you left off.',
    color: 'warning',
    icon: 'i-lucide-clock'
  },
  revoked: {
    title: 'You were signed out',
    description: 'This session was ended from another device or by an administrator. Sign in again to continue.',
    color: 'warning',
    icon: 'i-lucide-log-out'
  },
  reuse_detected: {
    title: 'All sessions were signed out',
    description: 'A sign-in token was used twice, so every session for this account was ended as a precaution. Sign in again; if this keeps happening, contact your administrator.',
    color: 'error',
    icon: 'i-lucide-shield-alert'
  },
  password_changed: {
    title: 'Your password was changed',
    description: 'Sign in with your new password to continue.',
    color: 'info',
    icon: 'i-lucide-key-round'
  },
  account_inactive: {
    title: 'This account cannot sign in',
    description: 'The account is locked, suspended or inactive. Contact your administrator.',
    color: 'error',
    icon: 'i-lucide-user-x'
  },
  wrong_application: {
    title: 'This console no longer accepts your account',
    description: 'Sign in with an account that has access to this application.',
    color: 'error',
    icon: 'i-lucide-ban'
  },
  signed_out: {
    title: 'You signed out',
    description: 'You signed out of this console in another tab.',
    color: 'neutral',
    icon: 'i-lucide-log-out'
  },
  signed_out_everywhere: {
    title: 'You signed out everywhere',
    description: 'Every session of this account was ended, including this one. Sign in again to continue.',
    color: 'info',
    icon: 'i-lucide-log-out'
  }
}

export function useSessionEndNotice() {
  const route = useRoute()
  const notice = computed<Notice | null>(() => {
    const reason = route.query.reason
    return isSessionEndReason(reason) ? SESSION_END_NOTICES[reason] : null
  })
  return { notice }
}

// Capability discovery failing at the network level (or with a 5xx) means the console cannot
// talk to its API: usually a wrong apiBaseUrl, a CORS origin the API does not allow, a CSP
// connect-src that omits the API, an http API behind an https console, or the API being down.
export function useAuthApiStatus() {
  const authConfig = useQuery(authConfigQuery)
  const origin = computed(() => getApiOrigin())
  const retrying = computed(() => authConfig.asyncStatus.value === 'loading')

  // What kind of trouble it is decides the advice: only a failed connection points at CORS
  // and connect-src; a timeout, a rate limit or a server error is the API's own state.
  const message = computed<{ title: string, description: string } | null>(() => {
    const error = authConfig.error.value
    if (!isTransientApiError(error)) return null
    if (error.kind === 'timeout') {
      return { title: 'The auth API is not responding', description: `${origin.value} did not answer in time. It may be overloaded or unreachable; retry in a moment.` }
    }
    if (error.status === 429) {
      return { title: 'The auth API is busy', description: `${origin.value} is limiting requests right now. Wait a moment, then retry.` }
    }
    if (error.status >= 500 || error.status === 408) {
      return { title: 'The auth API is having problems', description: `${origin.value} answered HTTP ${error.status}. This is usually temporary; retry in a moment.` }
    }
    return {
      title: 'Can\'t reach the auth API',
      description: `The console could not contact ${origin.value}. Check that the API is running, that it allows this console's origin (CORS), and that the Content-Security-Policy connect-src includes it.`
    }
  })

  function retry() {
    void authConfig.refetch()
  }

  return { message, retrying, retry }
}
