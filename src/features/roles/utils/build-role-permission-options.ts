import type { RolePermissionOption } from '@/features/roles/types/role-permission-option.types'
import { formatRoleToken } from '@/features/roles/utils/role-display'

type PermissionCatalogItem = {
  name: string
  display_name?: string | null
  description?: string | null
  resource?: string | null
}

export function buildRolePermissionOptions(
  catalogItems: PermissionCatalogItem[]
): RolePermissionOption[] {
  return catalogItems
    .map((catalogItem) => ({
      name: catalogItem.name,
      label: catalogItem.display_name || formatRoleToken(catalogItem.name),
      description: catalogItem.description ?? null,
      resource: catalogItem.resource || catalogItem.name.split(':')[0] || 'general',
    }))
    .sort((left, right) => left.label.localeCompare(right.label))
}
