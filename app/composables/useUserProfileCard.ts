import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { userRoleMembershipsQuery } from '~/queries/users'
import { userMembershipsQuery } from '~/queries/memberships'
import { userHolds } from '~/utils/users'
import { USER_STATUS_COLOR } from '~/utils/status'
import type { DetailItem } from '~/types/display'
import type { User } from '~/types/user'

// The Overview tab's Profile card (AppUserProfileCard): who the account is, its status with the
// holds the status does not show (a lockout, a timed suspension's end, F-061), and where it
// reaches (F-009). The status reads once, as the badge in the card header (F-065).
export function useUserProfileCard(user: Ref<User>) {
  const { canAccess, isEnterprise, hasMemberships, hasPermission } = useAuth()
  const canRead = computed(() => canAccess('users'))
  const canReadMemberships = computed(() => hasMemberships.value && hasPermission('membership:read'))

  // The same entries the Access tab reads (same keys and `enabled`), for the access-scope line.
  const roles = useQuery(() => ({ ...userRoleMembershipsQuery({ userId: user.value.id }), enabled: canRead.value }))
  const memberships = useQuery(() => ({ ...userMembershipsQuery(user.value.id), enabled: canReadMemberships.value }))

  const now = useRelativeNow()
  const holds = computed(() => userHolds(user.value, now.value.getTime()))
  // Beside the status badge only the holds it does not already say: a lockout on an account that
  // reads "Active". A suspension end is a detail row plus its explanation, not a third mention.
  const badgeHolds = computed(() => holds.value.filter(hold => hold.kind !== 'suspended'))
  const statusColor = computed(() => USER_STATUS_COLOR[user.value.status])

  // Where this account reaches (EnterpriseRBAC): superusers and holders of an active direct
  // system-wide role span every organization; everyone else stays in their organization.
  const accessScope = computed(() => {
    if (!isEnterprise.value) return null
    return accessScopeSummary({
      isSuperuser: Boolean(user.value.is_superuser),
      rootEntityName: user.value.root_entity_name,
      directGrants: roles.status.value === 'success' ? roles.data.value ?? [] : null,
      membershipCount: canReadMemberships.value && memberships.status.value === 'success' ? memberships.data.value?.length ?? 0 : null
    })
  })

  const items = computed<DetailItem[]>(() => {
    const u = user.value
    return [
      { label: 'Email', value: u.email },
      { label: 'First name', value: u.first_name },
      { label: 'Last name', value: u.last_name },
      // Time-bound holds the status does not show: a lockout, a timed suspension's end (F-061).
      ...(holds.value.some(hold => hold.kind === 'locked') ? [{ label: 'Locked until', value: u.locked_until, type: 'datetime' } satisfies DetailItem] : []),
      ...(u.status === 'suspended' ? [{ label: 'Suspension end', value: u.suspended_until, type: 'datetime', fallback: 'None set' } satisfies DetailItem] : []),
      { label: 'Superuser', value: u.is_superuser, type: 'boolean' },
      { label: 'Email verified', value: u.email_verified, type: 'boolean' },
      { label: 'Phone', value: u.phone },
      ...(u.phone ? [{ label: 'Phone verified', value: u.phone_verified, type: 'boolean' } satisfies DetailItem] : []),
      // Root organisation and access scope are EnterpriseRBAC concepts (F-008, F-009).
      ...(isEnterprise.value ? [{ label: 'Root entity', value: u.root_entity_name, fallback: 'None' } satisfies DetailItem] : []),
      ...(accessScope.value ? [{ label: 'Access scope', value: accessScope.value.label } satisfies DetailItem] : []),
      { label: 'Created', value: u.created_at, type: 'datetime' },
      { label: 'Last login', value: u.last_login, type: 'datetime', fallback: 'Never' },
      { label: 'Last activity', value: u.last_activity, type: 'datetime', fallback: 'None recorded' },
      { label: 'Password changed', value: u.last_password_change, type: 'datetime', fallback: 'Never' },
      ...(u.deleted_at ? [{ label: 'Deleted', value: u.deleted_at, type: 'datetime' } satisfies DetailItem] : [])
    ]
  })

  // A state the admin acts on differently: an invitation in flight, a deleted account.
  const notice = computed(() => {
    if (user.value.status === 'invited') {
      return {
        icon: 'i-lucide-mail',
        title: 'Invitation pending',
        description: 'The account has no password until the invitation is accepted. Resend invite sends a new link.'
      }
    }
    if (user.value.status === 'deleted') {
      return {
        icon: 'i-lucide-archive',
        title: 'Deleted account',
        description: 'Its roles, memberships, sessions and API keys were revoked. Restoring it brings back the identity only.'
      }
    }
    return null
  })

  return { items, holds, badgeHolds, statusColor, accessScope, notice }
}
