import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { userRoleMembershipsQuery } from '~/queries/users'
import type { User } from '~/types/user'
import { holdsSystemWideRoleRow } from '~/utils/role-access'
import { userRowPolicy } from '~/utils/users'

// What the signed-in admin may do to one account, for the user detail's header and cards. The
// same rules as the users list's row menu (userRowPolicy in utils/users.ts): a superuser account
// is changed only by a global admin, a deleted one can only be restored, and the admin's own
// account is managed from Account, so no status change, password reset or session revoke on
// oneself. Null while the account is not loaded: nothing is offered then (F-209).
//
// outlabs-auth 0.1.0a35 (EnterpriseRBAC) also refuses an admin without global reach any change
// to an account holding a direct system-wide role row, whatever its status (403 "Only global
// administrators can modify an account that holds a system-wide role"): its profile, password,
// status, deletion and restore, invitation, direct roles, sessions and API keys. Nothing on the
// user record says so; the account's direct roles do (GET /users/{id}/role-memberships with
// include_inactive, user:read), read here with the same key and `enabled` as the Access tab's
// Direct roles card, so the detail pays one request. While it loads, or if it fails, nothing is
// offered; the read leaves out rows of archived role definitions, which the server still counts,
// so such an account is offered the changes and the server's refusal is shown. Entity
// memberships are not refused by that rule (`canEditMemberships`).
export function useUserPolicy(user: Ref<User | null | undefined>) {
  const { hasPermission, user: actor, can, canAccess, isEnterprise } = useAuth()
  const { isGlobal } = useActorReach()

  const userId = computed(() => user.value?.id ?? '')
  const directRoles = useQuery(() => ({
    ...userRoleMembershipsQuery({ userId: userId.value, includeInactive: true }),
    enabled: canAccess('users') && Boolean(userId.value)
  }))
  // undefined: the rule does not apply (SimpleRBAC, oneself, a superuser account, a global admin);
  // null: not known yet.
  const holdsSystemWideRole = computed<boolean | null | undefined>(() => {
    const target = user.value
    if (!target || !isEnterprise.value || target.is_superuser || isGlobal.value === true) return undefined
    if (actor.value?.id === target.id) return undefined
    if (directRoles.status.value !== 'success') return null
    return holdsSystemWideRoleRow(directRoles.data.value ?? [])
  })

  const policyInput = (target: User, targetHoldsSystemWideRole: boolean | null | undefined) => userRowPolicy({
    actorId: actor.value?.id,
    actorIsGlobal: isGlobal.value,
    canUpdate: hasPermission('user:update'),
    canDelete: hasPermission('user:delete'),
    target,
    targetHoldsSystemWideRole
  })
  const policy = computed(() => (user.value ? policyInput(user.value, holdsSystemWideRole.value) : null))
  const isSelf = computed(() => Boolean(policy.value?.isSelf))
  const canEdit = computed(() => Boolean(policy.value?.canEdit))
  // Lifecycle writes on another account (status, password reset, sessions, superuser): the
  // admin's own account goes through Account instead.
  const canManage = computed(() => canEdit.value && !isSelf.value)
  // Resend invite (POST /users/{id}/resend-invite): an invited account, user:update and the
  // backend's invitations feature. The action menu offers it and the invited notice mentions it
  // under the same rule.
  const canResendInvite = computed(() => canEdit.value && user.value?.status === 'invited' && can('invitations'))
  // Entity memberships follow the account's other rules, not the system-wide one.
  const canEditMemberships = computed(() => Boolean(user.value && policyInput(user.value, undefined).canEdit))
  // Known to hold one: the detail says why nothing is offered.
  const systemWideLocked = computed(() => policy.value?.lock === 'system_wide_role')

  return { policy, isSelf, canEdit, canManage, canResendInvite, canEditMemberships, systemWideLocked }
}
