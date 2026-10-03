import { useQuery } from '@pinia/colada'
import { tokensPresent } from '~/auth/tokens'
import { myMembershipsQuery } from '~/queries/account'
import { myPermissionsQuery } from '~/queries/session'
import type { Membership } from '~/types/membership'
import type { RoleReference } from '~/types/role'
import { myAccessScopeSummary } from '~/utils/account'
import { membershipRoleDisplay } from '~/utils/role-access'
import { MEMBERSHIP_STATUS_COLOR, badgeColor } from '~/utils/status'

// The Access tab: what this account may do (F-103). Every persona can read it, a low-privilege
// one included: the effective permissions (GET /permissions/me, the same answer the console
// gates on) and, on EnterpriseRBAC, the entity memberships (GET /memberships/me) with their
// roles and validity, and how far the account reaches (organization scope).
//
// outlabs-auth 0.1.0a35 names each membership's entity and roles in /memberships/me (F-103), so an
// account that can read neither entities nor roles still sees them named. The role names are
// system names, not aligned with the role ids: they are tied to a role only when certain, and
// shown as names alone otherwise (membershipRoleDisplay); the role catalog, where readable, names
// the rest. A payload without names falls back to the entities the account can read, and to "not
// visible", never a raw id.

export type MyMembershipRow = {
  id: string
  entityId: string
  entityName: string | null
  roleIds: string[]
  // The role chips (with the membership's own name where certain) and the names alone.
  roles: RoleReference[]
  roleNames: string[]
  status: string
  statusColor: ReturnType<typeof badgeColor>
  validFrom: string | null
  validUntil: string | null
  inForce: boolean
}

export function useMyAccess() {
  const { user, isEnterprise, isSuperuser, canAccess, hasMemberships } = useAuth()

  // --- Effective permissions ---
  // Same options as useAuth's, so the shared entry has one `enabled` (ARCHITECTURE.md).
  const permissions = useQuery(() => ({ ...myPermissionsQuery, enabled: tokensPresent.value }))
  const permissionNames = computed(() => [...(permissions.data.value ?? [])].sort())

  // --- Organization scope (EnterpriseRBAC, F-009) ---
  // Superusers and holders of an active direct system-wide role reach every organization. Reading
  // one's own direct roles needs the Users section (user:read); without it the summary names the
  // organization and the memberships in force without claiming a limit it cannot see. Worded
  // for the account itself (myAccessScopeSummary), not as an admin's view of another user.
  const { ownRoles, ownRolesReadable } = useActorReach()

  // --- Memberships (EnterpriseRBAC) ---
  const membershipsShown = computed(() => isEnterprise.value && hasMemberships.value)
  const memberships = useQuery(() => ({ ...myMembershipsQuery, enabled: membershipsShown.value }))
  const entitiesReadable = computed(() => membershipsShown.value && canAccess('entities'))
  const { entities } = useScopedEntities(entitiesReadable)
  const entityNames = computed(() => new Map(entities.value.map(entity => [entity.id, entity.display_name || entity.name])))
  const roleCatalog = useRoleCatalog()

  const membershipRows = computed<MyMembershipRow[]>(() => (memberships.data.value ?? [])
    .map((membership: Membership) => {
      const status = membership.effective_status || membership.status
      const roles = membershipRoleDisplay(membership, { catalogNames: roleCatalog.systemNames.value })
      return {
        id: membership.id,
        entityId: membership.entity_id,
        entityName: membership.entity_display_name || membership.entity_name || entityNames.value.get(membership.entity_id) || null,
        roleIds: membership.role_ids ?? [],
        roles: roles.chips,
        roleNames: roles.names,
        status,
        statusColor: badgeColor(MEMBERSHIP_STATUS_COLOR, status),
        validFrom: membership.valid_from ?? null,
        validUntil: membership.valid_until ?? null,
        inForce: membership.is_currently_valid
      }
    })
    // Memberships in force first, then by entity name.
    .sort((a, b) => Number(b.inForce) - Number(a.inForce) || (a.entityName ?? '￿').localeCompare(b.entityName ?? '￿')))

  const accessScope = computed(() => {
    const u = user.value
    if (!u || !isEnterprise.value) return null
    const grants = ownRolesReadable.value && ownRoles.status.value === 'success' ? ownRoles.data.value ?? [] : null
    const inForce = memberships.status.value === 'success' ? membershipRows.value.filter(row => row.inForce).length : null
    return myAccessScopeSummary({ isSuperuser: isSuperuser.value, rootEntityName: u.root_entity_name, directGrants: grants, membershipCount: inForce })
  })

  return {
    isSuperuser,
    isEnterprise,
    accessScope,
    permissionNames,
    permissionsStatus: permissions.status,
    permissionsError: permissions.error,
    permissionsFetching: permissions.isLoading,
    refetchPermissions: permissions.refetch,
    membershipsShown,
    membershipRows,
    membershipsStatus: memberships.status,
    membershipsError: memberships.error,
    membershipsFetching: memberships.isLoading,
    refetchMemberships: memberships.refetch
  }
}
