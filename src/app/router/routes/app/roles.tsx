import { Outlet, createFileRoute } from '@tanstack/react-router'

import { parseRolesSearch } from '@/features/roles/schemas/roles-search.schema'
import type { RolesPageSearch } from '@/features/roles/types/roles.types'

export const Route = createFileRoute('/app/roles')({
  validateSearch: (search): RolesPageSearch => parseRolesSearch(search),
  component: Outlet,
})
