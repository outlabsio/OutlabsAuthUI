import { Outlet, createFileRoute } from '@tanstack/react-router'

import { parsePermissionsSearch } from '@/features/permissions/schemas/permissions-search.schema'
import type { PermissionsPageSearch } from '@/features/permissions/types/permissions.types'

export const Route = createFileRoute('/app/permissions')({
  validateSearch: (search): PermissionsPageSearch => parsePermissionsSearch(search),
  component: Outlet,
})
