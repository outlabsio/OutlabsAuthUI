import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as RolesLayoutRoute } from '@/app/router/routes/app/roles'
import { RoleDetailsPage } from '@/features/roles/components/role-details-page'
import { routes } from '@/lib/constants/routes'

function RoleDetailsRouteComponent() {
  const navigate = useNavigate()
  const { roleId } = Route.useParams()
  const search = RolesLayoutRoute.useSearch()

  return (
    <RoleDetailsPage
      roleId={roleId}
      onBack={() => {
        void navigate({
          to: routes.app.roles,
          search,
        })
      }}
      onDeleted={() => {
        void navigate({
          to: routes.app.roles,
          search,
        })
      }}
    />
  )
}

export const Route = createFileRoute('/app/roles/$roleId')({
  component: RoleDetailsRouteComponent,
})
