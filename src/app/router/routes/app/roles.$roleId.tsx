import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as RolesLayoutRoute } from '@/app/router/routes/app/roles'
import { RolesPage } from '@/features/roles/components/roles-page'
import { routes } from '@/lib/constants/routes'

function RoleDetailsRouteComponent() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const search = RolesLayoutRoute.useSearch()

  return (
    <RolesPage
      selectedRoleId={params.roleId}
      search={search}
      onSearchChange={(next) => {
        void navigate({
          to: routes.app.roleDetail,
          params,
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

export const Route = createFileRoute('/app/roles/$roleId')({
  component: RoleDetailsRouteComponent,
})
