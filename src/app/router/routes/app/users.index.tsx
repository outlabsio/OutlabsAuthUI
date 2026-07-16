import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as UsersLayoutRoute } from '@/app/router/routes/app/users'
import { UsersPage } from '@/features/users/components/users-page'
import { routes } from '@/lib/constants/routes'

function UsersIndexRouteComponent() {
  const navigate = useNavigate()
  const search = UsersLayoutRoute.useSearch()

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
            view: next.view,
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
      onUserSelect={(userId) => {
        void navigate({
          to: routes.app.userDetail,
          params: {
            userId,
          },
          search,
        })
      }}
    />
  )
}

export const Route = createFileRoute('/app/users/')({
  component: UsersIndexRouteComponent,
})
