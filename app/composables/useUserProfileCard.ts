import type { Ref } from 'vue'
import { useQuery } from '@pinia/colada'
import { userRoleMembershipsQuery } from '~/queries/users'
import { userMembershipsQuery } from '~/queries/memberships'
import { deletedAccountSummary, passwordStateLabel, userHolds } from '~/utils/users'
import { USER_STATUS_COLOR } from '~/utils/status'
import type { DetailItem } from '~/types/display'
import type { User } from '~/types/user'

// The Overview tab's Profile card (AppUserProfileCard): who the account is, its status with the
// holds the status does not show (a lockout, a timed suspension's end, F-061), and where it
// reaches (F-009). The status reads once, as the badge in the card header (F-065).
export function useUserProfileCard(user: Ref<User>) {
  const { canAccess, isEnterprise, hasMemberships, hasPermission } = useAuth()
  const { canResendInvite } = useUserPolicy(user)
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

  // Each explanation sits with its own row (a lockout, a suspension end, the access scope), and
  // Email takes a full row so First name and Last name pair up. The words are the users list's:
  // Organization, Last sign-in.
  const items = computed<DetailItem[]>(() => {
    const u = user.value
    const holdNote = (kind: 'locked' | 'suspended') => holds.value.find(hold => hold.kind === kind)?.description
    return [
      { label: 'Email', value: u.email, full: true },
      { label: 'First name', value: u.first_name },
      { label: 'Last name', value: u.last_name },
      // Time-bound holds the status does not show: a lockout, a timed suspension's end (F-061).
      ...(holds.value.some(hold => hold.kind === 'locked') ? [{ label: 'Locked until', value: u.locked_until, type: 'datetime', description: holdNote('locked') } satisfies DetailItem] : []),
      ...(u.status === 'suspended' ? [{ label: 'Suspension end', value: u.suspended_until, type: 'datetime', fallback: 'None set', description: holdNote('suspended') } satisfies DetailItem] : []),
      { label: 'Superuser', value: u.is_superuser, type: 'boolean' },
      { label: 'Email verified', value: u.email_verified, type: 'boolean' },
      { label: 'Phone', value: u.phone },
      ...(u.phone ? [{ label: 'Phone verified', value: u.phone_verified, type: 'boolean' } satisfies DetailItem] : []),
      // The organisation and access scope are EnterpriseRBAC concepts (F-008, F-009).
      ...(isEnterprise.value ? [{ label: 'Organization', value: u.root_entity_name, fallback: 'None' } satisfies DetailItem] : []),
      ...(accessScope.value ? [{ label: 'Access scope', value: accessScope.value.label, description: accessScope.value.description } satisfies DetailItem] : []),
      { label: 'Created', value: u.created_at, type: 'datetime' },
      { label: 'Last sign-in', value: u.last_login, type: 'datetime', fallback: 'Never' },
      { label: 'Last activity', value: u.last_activity, type: 'datetime', fallback: 'None recorded' },
      // Whether the account has a password at all (has_password), then when it last changed.
      { label: 'Password', value: passwordStateLabel(u) },
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
        // Resend is named only where this admin is offered it.
        description: canResendInvite.value
          ? 'The account has no password until the invitation is accepted. Resend invite sends a new link.'
          : 'The account has no password until the invitation is accepted.'
      }
    }
    if (user.value.status === 'deleted') {
      return {
        icon: 'i-lucide-archive',
        title: 'Deleted account',
        description: deletedAccountSummary({ hasMemberships: hasMemberships.value })
      }
    }
    return null
  })

  return { items, badgeHolds, statusColor, notice }
}
