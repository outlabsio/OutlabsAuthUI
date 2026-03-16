import { Outlet, createFileRoute } from '@tanstack/react-router'

import { parseUsersSearch } from '@/features/users/schemas/users-search.schema'
import type { UsersPageSearch } from '@/features/users/types/users.types'

export const Route = createFileRoute('/app/users')({
  validateSearch: (search): UsersPageSearch => parseUsersSearch(search),
  component: Outlet,
})
