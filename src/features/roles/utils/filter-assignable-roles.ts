import type { Role } from '@/features/roles/types/roles.types'
import {
  getRoleAssignmentRuleLabel,
  getRoleDefinitionLabel,
  getRoleScopeSummary,
  getRoleTypeLabel,
} from '@/features/roles/utils/role-display'

function getRoleSearchHaystack(role: Role) {
  return [
    role.name,
    role.display_name,
    role.description,
    getRoleTypeLabel(role),
    getRoleDefinitionLabel(role),
    getRoleScopeSummary(role),
    getRoleAssignmentRuleLabel(role),
    ...role.permissions,
    ...role.assignable_at_types,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function filterAssignableRoles({
  roles,
  searchValue,
  selectedRoleIdSet,
  showSelectedOnly,
}: {
  roles: Role[]
  searchValue: string
  selectedRoleIdSet: Set<string>
  showSelectedOnly: boolean
}) {
  const normalizedSearchValue = searchValue.trim().toLowerCase()

  return roles.filter((role) => {
    if (showSelectedOnly && !selectedRoleIdSet.has(role.id)) {
      return false
    }

    if (!normalizedSearchValue) {
      return true
    }

    return getRoleSearchHaystack(role).includes(normalizedSearchValue)
  })
}
