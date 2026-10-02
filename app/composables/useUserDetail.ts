import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import type { ButtonProps, DropdownMenuItem, NavigationMenuItem } from '@nuxt/ui'
import { useDeleteUser, useResendInvite, useRestoreUser, userDetailQuery } from '~/queries/users'
import { canChangeStatus, isUuid, resendInviteCopy, restoreUserCopy, userDeleteCopy } from '~/utils/users'
import type { User } from '~/types/user'

// The user detail page's frame (pages/app/users/[userId].vue): the record, its not-found and
// denied states, the tabs, and the header's actions with their dialogs. Each tab's cards are
// components with their own composables (components/app/user/*), which mount only once the
// record has loaded, so none of their requests fire for a missing or unreadable account (F-122).
//
// Tabs (F-065) are the route query `?tab=` (overview by default): access before history, and
// Back goes to the users list rather than through the tabs (useBackNavigation counts a same-path
// entry as the record itself).

export type UserDetailTab = 'overview' | 'access' | 'security' | 'history'

// Labels only: with icons the four tabs do not fit a 390px toolbar.
const TAB_META: Record<UserDetailTab, { label: string }> = {
  overview: { label: 'Overview' },
  access: { label: 'Access' },
  security: { label: 'Security' },
  history: { label: 'History' }
}

export function useUserDetail(userId: Ref<string>) {
  const route = useRoute()
  const { capabilities, canAccess, isEnterprise, hasMemberships, isSuperuser } = useAuth()

  // Same requirement as the Users nav item and the page gate (APP_SECTIONS 'users').
  const canRead = computed(() => canAccess('users'))
  // A malformed id is a link nobody can open: "not found" without asking the API.
  const validId = computed(() => isUuid(userId.value))

  const { data, status, error, isLoading, refetch } = useQuery(() => ({
    ...userDetailQuery(userId.value),
    enabled: canRead.value && validId.value
  }))
  const user = computed<User | null>(() => data.value ?? null)
  const apiError = useApiError(error)
  // 404 (missing, or outside the admin's organization: outlabs-auth answers 404 rather than
  // confirm the account exists) and 422 (an id the API cannot parse).
  const notFound = computed(() => !validId.value || (!data.value && (apiError.value?.kind === 'not_found' || apiError.value?.status === 422)))
  const denied = computed(() => !data.value && apiError.value?.kind === 'forbidden')
  const deniedMessage = computed(() => apiError.value?.message ?? '')

  // --- Capabilities of the cards (hidden, not flagged, when the server lacks them) ---
  const personalApiKeysAvailable = computed(() => Boolean(capabilities.value?.features?.api_keys))
  const auditTimelineAvailable = computed(() => Boolean(capabilities.value?.features?.activity_tracking))
  // Membership history is an EnterpriseRBAC concept (F-008).
  const membershipHistoryAvailable = computed(() => isEnterprise.value)
  const invitationsEnabled = computed(() => Boolean(capabilities.value?.features?.invitations))

  // --- Tabs ---
  const availableTabs = computed<UserDetailTab[]>(() => [
    'overview',
    'access',
    'security',
    ...(auditTimelineAvailable.value || membershipHistoryAvailable.value ? ['history' as const] : [])
  ])
  const tab = computed<UserDetailTab>(() => {
    const requested = typeof route.query.tab === 'string' ? route.query.tab : 'overview'
    return (availableTabs.value as string[]).includes(requested) ? requested as UserDetailTab : 'overview'
  })
  const tabs = computed<NavigationMenuItem[]>(() => availableTabs.value.map((value) => {
    const query = { ...route.query }
    if (value === 'overview') delete query.tab
    else query.tab = value
    const active = tab.value === value
    return { ...TAB_META[value], 'value': value, 'to': { query }, 'active': active, 'aria-current': active ? 'page' : undefined }
  }))

  // --- Header actions (F-065, F-128, F-209) ---
  const { policy, isSelf, canEdit, canManage } = useUserPolicy(user)
  const profileOpen = ref(false)
  const statusOpen = ref(false)
  const resetOpen = ref(false)
  const superuserOpen = ref(false)
  const openDialog = (flag: Ref<boolean>) => {
    flag.value = true
  }

  // Resend invite and Restore ask first: a resend replaces the link the invitee already has, and
  // a restore brings back the identity without its access (F-207).
  const resend = useResendInvite()
  const resendInvite = useConfirmAction<User>({
    describe: target => resendInviteCopy(target),
    action: target => resend.mutateAsync(target.id),
    success: 'Invitation resent',
    error: 'Could not resend invitation',
    notFoundCodes: ['USER_NOT_FOUND']
  })
  const restore = useRestoreUser()
  const restoreUser = useConfirmAction<User>({
    describe: target => restoreUserCopy(target, { hasMemberships: hasMemberships.value }),
    action: target => restore.mutateAsync(target.id),
    success: 'User restored',
    error: 'Could not restore user',
    notFoundCodes: ['USER_NOT_FOUND']
  })
  // Delete keeps the account as deleted (restorable): the page stays and shows it.
  const remove = useDeleteUser()
  const deleteUser = useConfirmAction<User>({
    describe: target => userDeleteCopy(target, { hasMemberships: hasMemberships.value }),
    action: target => remove.mutateAsync(target.id),
    success: 'User deleted',
    error: 'Could not delete user'
  })

  // Built only for a loaded account, from the same policy as the list's row menu. Edit is the
  // navbar's own button; the menu holds the rest, Delete last.
  const actionItems = computed<DropdownMenuItem[][]>(() => {
    const target = user.value
    const rules = policy.value
    if (!target || !rules || status.value !== 'success') return []
    const lifecycle: DropdownMenuItem[] = []
    if (canManage.value && canChangeStatus(target.status)) {
      lifecycle.push({ label: 'Change status', icon: 'i-lucide-user-cog', onSelect: () => openDialog(statusOpen) })
    }
    // An invited account has no password yet: it sets one by accepting the invitation.
    if (canManage.value && target.status !== 'invited') {
      lifecycle.push({ label: 'Reset password', icon: 'i-lucide-key-round', onSelect: () => openDialog(resetOpen) })
    }
    if (rules.canEdit && target.status === 'invited' && invitationsEnabled.value) {
      lifecycle.push({ label: 'Resend invite', icon: 'i-lucide-mail', onSelect: () => resendInvite.ask(target) })
    }
    if (rules.canRestore) {
      lifecycle.push({ label: 'Restore user', icon: 'i-lucide-undo-2', onSelect: () => restoreUser.ask(target) })
    }
    const groups: DropdownMenuItem[][] = []
    if (lifecycle.length) groups.push(lifecycle)
    if (isSelf.value) groups.push([{ label: 'Your account', icon: 'i-lucide-circle-user', to: '/app/account' }])
    // The superuser flag: superusers only, never on oneself (revoking your own flag would lock
    // you out of granting it back), never on a deleted account.
    if (isSuperuser.value && !isSelf.value && target.status !== 'deleted') {
      groups.push([target.is_superuser
        ? { label: 'Revoke superuser', icon: 'i-lucide-shield-minus', onSelect: () => openDialog(superuserOpen) }
        : { label: 'Grant superuser', icon: 'i-lucide-shield-plus', onSelect: () => openDialog(superuserOpen) }])
    }
    if (rules.canDelete) {
      groups.push([{ label: 'Delete user', icon: 'i-lucide-trash', color: 'error', onSelect: () => deleteUser.ask(target) }])
    }
    return groups
  })

  // The Access tab of a deleted account: its grants stay on record, nothing can be changed until
  // it is restored (F-174); Restore is offered right there when this admin may restore it.
  const deletedNotice = computed<{ description: string, actions: ButtonProps[] } | null>(() => {
    const target = user.value
    if (!target || target.status !== 'deleted') return null
    const canRestore = Boolean(policy.value?.canRestore)
    return {
      description: canRestore
        ? 'Deleting it revoked its roles and memberships; they stay on record below. Restore the account to manage its access again.'
        : 'Deleting it revoked its roles and memberships; they stay on record below. Access can be managed again only once the account is restored.',
      actions: canRestore ? [{ label: 'Restore user', color: 'neutral', variant: 'outline', icon: 'i-lucide-undo-2', onClick: () => restoreUser.ask(target) }] : []
    }
  })

  return {
    user,
    status,
    error,
    isLoading,
    refetch,
    notFound,
    denied,
    deniedMessage,
    isEnterprise,
    hasMemberships,
    personalApiKeysAvailable,
    auditTimelineAvailable,
    membershipHistoryAvailable,
    tab,
    tabs,
    canEdit: computed(() => canEdit.value && status.value === 'success'),
    actionItems,
    profileOpen,
    statusOpen,
    resetOpen,
    superuserOpen,
    resendInvite,
    restoreUser,
    deleteUser,
    deletedNotice
  }
}
