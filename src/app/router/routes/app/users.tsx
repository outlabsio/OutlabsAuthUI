import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'

import { UsersPage } from '@/features/users/components/users-page'
import type { UsersPageSearch } from '@/features/users/types/users.types'
import { routes } from '@/lib/constants/routes'

const userStatusFilterSchema = z.enum(['active', 'invited', 'suspended', 'banned'])

const usersSearchSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  search: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
  status: userStatusFilterSchema.optional(),
  rootEntityId: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || undefined),
})

function UsersRouteComponent() {
  const navigate = useNavigate()
  const search = Route.useSearch()

  return (
    <UsersPage
      filters={search}
      onFiltersChange={(next) => {
        void navigate({
          to: routes.app.users,
          search: {
            page: 1,
            search: next.search,
            status: next.status,
            rootEntityId: next.rootEntityId,
          },
        })
      }}
      onPageChange={(page) => {
        void navigate({
          to: routes.app.users,
          search: {
            ...search,
            page,
          },
        })
      }}
    />
  )
}

export const Route = createFileRoute('/app/users')({
  validateSearch: (search): UsersPageSearch => usersSearchSchema.parse(search),
  component: UsersRouteComponent,
})
