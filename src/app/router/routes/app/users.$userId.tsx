import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as UsersLayoutRoute } from '@/app/router/routes/app/users'
import { UserDetailsPage } from '@/features/users/components/user-details-page'
import { routes } from '@/lib/constants/routes'

function UserDetailsRouteComponent() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const search = UsersLayoutRoute.useSearch()

  return (
    <UserDetailsPage
      userId={params.userId}
      onBack={() => {
        void navigate({
          to: routes.app.users,
          search,
        })
      }}
      onDeleted={() => {
        void navigate({
          to: routes.app.users,
          search,
        })
      }}
    />
  )
}

export const Route = createFileRoute('/app/users/$userId')({
  component: UserDetailsRouteComponent,
})
