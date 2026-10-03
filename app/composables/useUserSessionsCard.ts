import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { useRevokeAllUserSessions, useRevokeUserSession, userSessionsQuery } from '~/queries/users'
import { sessionDeviceLabel } from '~/utils/user-agent'
import type { UserSession } from '~/types/account'
import type { User } from '~/types/user'

// The Security tab's Sessions card (AppUserSessionsCard): where the account is signed in, and
// the admin's force sign-out (F-014): revoke one session, or every one ("Sign out everywhere"),
// with user:update on another account (the admin's own sessions are managed from Account).
// outlabs-auth revokes the refresh tokens at once; an access token already issued keeps working
// until it expires unless the host enables the token blacklist, so the copy says "when its
// current access token expires", not "immediately". The server marks this browser's session
// (`is_current`) only on the admin's own account, which is not revocable here; outlabs-auth
// 0.1.0a35 has no keep-current option for another account (only for /users/me), so there is no
// "Sign out other devices" here.
export function useUserSessionsCard(user: Ref<User>) {
  const { canAccess } = useAuth()
  const userId = computed(() => user.value.id)
  const canRead = computed(() => canAccess('users'))
  const { canManage } = useUserPolicy(user)

  const { data, status, error, isLoading, refetch } = useQuery(() => ({ ...userSessionsQuery(userId.value), enabled: canRead.value }))
  const sessions = computed<UserSession[]>(() => data.value ?? [])
  const hasData = computed(() => data.value !== undefined)

  const revokeOne = useRevokeUserSession()
  const revoke = useConfirmAction<UserSession>({
    describe: session => ({
      title: `Revoke session ${sessionDeviceLabel(session)}`,
      description: `A session of ${user.value.email}.`,
      effects: [
        'That device can no longer renew its session. It is signed out when its current access token expires.',
        'They sign in again to continue there. Their other sessions, password and API keys are not affected.',
        'The revocation is recorded in the audit log.'
      ],
      confirmLabel: 'Revoke session'
    }),
    action: session => revokeOne.mutateAsync({ userId: userId.value, sessionId: session.id }),
    success: 'Session revoked',
    error: 'Could not revoke session'
  })

  const revokeAll = useRevokeAllUserSessions()
  const signOutEverywhere = useConfirmAction<User>({
    describe: target => ({
      title: `Sign out ${target.email} everywhere`,
      description: 'End every session of this account, on every device.',
      effects: [
        'No device can renew its session. Each one is signed out when its current access token expires.',
        'They can sign in again with their password: to keep them out, change their status or reset their password too.',
        'API keys are not affected. The revocation is recorded in the audit log.'
      ],
      confirmLabel: 'Sign out everywhere'
    }),
    action: target => revokeAll.mutateAsync(target.id),
    success: 'Signed out everywhere',
    error: 'Could not sign out everywhere'
  })

  // Sign out everywhere only when there is something to end.
  const canSignOutEverywhere = computed(() => canManage.value && status.value === 'success' && sessions.value.length > 0)

  return {
    sessions,
    status,
    error,
    isLoading,
    hasData,
    refetch,
    canRevoke: canManage,
    revoke,
    canSignOutEverywhere,
    signOutEverywhere,
    askSignOutEverywhere: () => signOutEverywhere.ask(user.value)
  }
}
