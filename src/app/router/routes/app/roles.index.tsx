import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as RolesLayoutRoute } from '@/app/router/routes/app/roles'
import { RolesPage } from '@/features/roles/components/roles-page'
import { routes } from '@/lib/constants/routes'

function RolesIndexRouteComponent() {
  const navigate = useNavigate()
  const search = RolesLayoutRoute.useSearch()

  return (
    <RolesPage
      search={search}
      onSearchChange={(next) => {
        void navigate({
          to: routes.app.roles,
          search: next,
        })
      }}
      onRoleSelect={(roleId) => {
        if (!roleId) {
          void navigate({
            to: routes.app.roles,
            search,
          })
          return
        }

        void navigate({
          to: routes.app.roleDetail,
          params: {
            roleId,
          },
          search,
        })
      }}
    />
  )
}

export const Route = createFileRoute('/app/roles/')({
  component: RolesIndexRouteComponent,
})
