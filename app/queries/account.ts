import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient, blacklistAccessToken, endSession, renewAccessToken, withFrontendProfileQuery } from '~/api/client'
import { getStoredAccessToken } from '~/auth/tokens'
import { useInvalidateAfter } from '~/queries/invalidation'
import { signInAgainWithPassword } from '~/queries/session'
import { IDENTITY_STALE_TIME } from '~/queries/freshness'
import { isSessionNotBoundError } from '~/utils/account'
import type { SessionUser } from '~/types/auth'
import type { Membership } from '~/types/membership'
import type {
  ChangeCurrentUserPasswordInput,
  SocialAccount,
  UpdateCurrentUserInput,
  UserSession
} from '~/types/account'

// The current actor's own account: profile, password, phone, sessions, linked accounts and
// what the account may do (memberships). Self-service endpoints only; no admin permission.

const SESSIONS_ROOT = 'my-sessions' as const
export const SOCIAL_ACCOUNTS_ROOT = 'my-social-accounts' as const

export const mySessionsQuery = defineQueryOptions({
  key: [SESSIONS_ROOT],
  query: ctx => apiClient.get<UserSession[]>('/users/me/sessions', { signal: ctx?.signal })
})

// GET /memberships/me (EnterpriseRBAC, memberships router): the actor's entity memberships,
// every status, so the Access tab can say which ones are not in force. The library returns ids
// only (entity_id, role_ids); names come from what the actor can read.
export const myMembershipsQuery = defineQueryOptions({
  key: ['memberships', 'me', { includeInactive: true }],
  query: ctx => apiClient.get<Membership[]>('/memberships/me?include_inactive=true', { signal: ctx?.signal }),
  staleTime: IDENTITY_STALE_TIME
})

export function useUpdateProfile() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (input: UpdateCurrentUserInput) => apiClient.patch<SessionUser>('/users/me', { body: input }),
    onSettled: () => invalidate('profile')
  })
}

export type PasswordChangeResult
  = | { signedIn: true }
    // The password changed, but signing in again with it failed (rate limit, a policy that
    // blocks password sign-in, no answer): this tab was signed out with the reason.
    | { signedIn: false, error: unknown }

/**
 * Change the password, then sign this browser in again with the new one (F-029). The server
 * ends every session of the account on a password change, this one included: its refresh token
 * is revoked and its access token is rejected as issued before the change. Signing in again at
 * once keeps this tab working; when that fails, the tab is signed out with the reason
 * (`password_changed`) and lands on sign-in, instead of holding a session the server ended.
 */
export function useChangePassword() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: async (input: ChangeCurrentUserPasswordInput & { email: string }): Promise<PasswordChangeResult> => {
      // A wrong current password is a 401 answer, not an expired session: never renew + replay.
      await apiClient.post<undefined>('/users/me/change-password', {
        body: { current_password: input.current_password, new_password: input.new_password },
        verifiesSecret: true
      })
      try {
        await signInAgainWithPassword(queryCache, { email: input.email, password: input.new_password })
        return { signedIn: true }
      } catch (error) {
        endSession('password_changed')
        return { signedIn: false, error }
      }
    }
  })
}

// Phone verification (F3) — request a code to the actor's registered phone (delivered via the
// host messaging service, WhatsApp/SMS), then confirm it to mark the number verified. A
// verified phone unlocks OTP sign-in for that number.
export function useRequestPhoneVerification() {
  return useMutation({
    mutation: () => apiClient.post<undefined>('/users/me/phone/request-code', { body: {} })
  })
}

export function useConfirmPhoneVerification() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    // A wrong or expired code is a 401 answer (TOKEN_INVALID / TOKEN_EXPIRED), not a session failure.
    mutation: (code: string) => apiClient.post<SessionUser>('/users/me/phone/verify-code', { body: { code }, verifiesSecret: true }),
    onSettled: () => invalidate('profile')
  })
}

// Connected social accounts (gap-backlog #1) — list linked OAuth providers, unlink one, and
// start the associate redirect to link another (GET /oauth-associate/{provider}/authorize is
// Bearer-authenticated; the provider callback lands back on /app/account?linked=<provider>).
export const mySocialAccountsQuery = defineQueryOptions({
  key: [SOCIAL_ACCOUNTS_ROOT],
  query: ctx => apiClient.get<SocialAccount[]>('/users/me/social-accounts', { signal: ctx?.signal })
})

export function useUnlinkSocialAccount() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (accountId: string) => apiClient.delete<undefined>(`/users/me/social-accounts/${accountId}`),
    onSettled: () => invalidate('socialAccounts')
  })
}

export function useStartSocialLink() {
  return useMutation({
    // ?app= carries the registered frontend profile key so the provider callback returns to
    // this console (same contract as the sign-in authorize call).
    mutation: (provider: string) =>
      apiClient.get<{ authorization_url: string }>(withFrontendProfileQuery(`/oauth-associate/${provider}/authorize`))
  })
}

export function useRevokeSession() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (sessionId: string) => apiClient.delete<undefined>(`/users/me/sessions/${sessionId}`),
    onSettled: () => invalidate('mySessions')
  })
}

export type RevokeOtherSessionsOutcome
  = | 'revoked'
    // The server cannot tell which session this browser holds, even after a renewal: nothing was
    // revoked (see isSessionNotBoundError).
    | 'session_not_bound'

const revokeOtherSessions = () => apiClient.delete<undefined>('/users/me/sessions?keep_current=true')

/**
 * Sign out other devices. DELETE /users/me/sessions?keep_current=true revokes every refresh token
 * of the account except the session named by the access token's `sid` claim, so this browser
 * stays signed in: nothing here ends this session or blacklists its token. An access token
 * minted before outlabs-auth 0.1.0a35 names no session and is refused with a 400; a renewal adds
 * the claim, so the console renews once (through the shared refresh lock) and asks again. A
 * second refusal is the 'session_not_bound' outcome, which the caller explains.
 */
export function useRevokeOtherSessions() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: async (): Promise<RevokeOtherSessionsOutcome> => {
      try {
        await revokeOtherSessions()
        return 'revoked'
      } catch (error) {
        if (!isSessionNotBoundError(error)) throw error
      }
      await renewAccessToken()
      try {
        await revokeOtherSessions()
        return 'revoked'
      } catch (error) {
        if (isSessionNotBoundError(error)) return 'session_not_bound'
        throw error
      }
    },
    onSettled: () => invalidate('mySessions')
  })
}

/**
 * Sign out everywhere (F-030). DELETE /users/me/sessions revokes every refresh token of the
 * account, this browser's included (useRevokeOtherSessions keeps it), so on success this tab is
 * signed out as well and lands on sign-in with the reason; its access token is then blacklisted
 * in the background, so it stops working at once. Other devices keep a working access token
 * until it expires and cannot renew it.
 */
export function useRevokeAllSessions() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: () => apiClient.delete<undefined>('/users/me/sessions'),
    onSuccess: () => {
      // Read before signing out: the request may have renewed the token it was sent with.
      const accessToken = getStoredAccessToken()
      endSession('signed_out_everywhere')
      if (accessToken) void blacklistAccessToken(accessToken)
    },
    onError: () => invalidate('mySessions')
  })
}
