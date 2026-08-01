import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as PermissionsLayoutRoute } from '@/app/router/routes/app/permissions'
import { PermissionsPage } from '@/features/permissions/components/permissions-page'
import { routes } from '@/lib/constants/routes'

function PermissionDetailsRouteComponent() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const search = PermissionsLayoutRoute.useSearch()

  return (
    <PermissionsPage
      selectedPermissionId={params.permissionId}
      search={search}
      onSearchChange={(next) => {
        void navigate({
          to: routes.app.permissionDetail,
          params,
          search: next,
        })
      }}
      onPermissionSelect={(permissionId) => {
        if (!permissionId) {
          void navigate({
            to: routes.app.permissions,
            search,
          })
          return
        }

        void navigate({
          to: routes.app.permissionDetail,
          params: {
            permissionId,
          },
          search,
        })
      }}
    />
  )
}

export const Route = createFileRoute('/app/permissions/$permissionId')({
  component: PermissionDetailsRouteComponent,
})
