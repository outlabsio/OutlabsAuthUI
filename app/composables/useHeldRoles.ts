import { useQuery } from '@pinia/colada'
import { myMembershipsQuery } from '~/queries/account'
import { grantEffectiveStatus } from '~/utils/access-grants'

// The roles the signed-in admin holds right now (F-177): direct role assignments in force (the
// own-roles query useActorReach reads) and, on EnterpriseRBAC, the roles of their entity
// memberships in force (GET /memberships/me, the query the Account Access tab reads, with the
// same `enabled`). The roles workspace marks those roles "You hold this role" and warns before
// an archive or a permission removal that would also take access away from the admin.
// A superuser keeps every permission whatever their roles carry, so `atRisk` is false for them.
export function useHeldRoles() {
  const { isEnterprise, hasMemberships, isSuperuser } = useAuth()
  const { ownRoles, ownRolesReadable } = useActorReach()

  const membershipsShown = computed(() => isEnterprise.value && hasMemberships.value)
  const memberships = useQuery(() => ({ ...myMembershipsQuery, enabled: membershipsShown.value }))

  const heldRoleIds = computed<ReadonlySet<string>>(() => {
    const ids = new Set<string>()
    const now = Date.now()
    if (ownRolesReadable.value) {
      for (const grant of ownRoles.data.value ?? []) {
        if (grantEffectiveStatus(grant, now) === 'active') ids.add(grant.role.id)
      }
    }
    if (membershipsShown.value) {
      for (const membership of memberships.data.value ?? []) {
        if (membership.is_currently_valid) for (const id of membership.role_ids ?? []) ids.add(id)
      }
    }
    return ids
  })

  const holds = (roleId: string) => heldRoleIds.value.has(roleId)
  // Whether changing this role can take access away from the admin themselves.
  const atRisk = (roleId: string) => !isSuperuser.value && holds(roleId)

  return { heldRoleIds, holds, atRisk }
}
