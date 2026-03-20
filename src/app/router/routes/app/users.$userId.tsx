import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as UsersLayoutRoute } from '@/app/router/routes/app/users'
import { UserDetailsPage } from '@/features/users/components/user-details-page'
import { parseUserDetailsSearch } from '@/features/users/schemas/user-details-search.schema'
import type { UserDetailsPageSearch } from '@/features/users/types/users.types'
import { routes } from '@/lib/constants/routes'

export const Route = createFileRoute('/app/users/$userId')({
  validateSearch: (search): UserDetailsPageSearch => parseUserDetailsSearch(search),
  component: function UserDetailsRouteComponent() {
    const navigate = useNavigate()
    const params = Route.useParams()
    const usersSearch = UsersLayoutRoute.useSearch()
    const search = Route.useSearch()

    const backLabel = search.source === 'entities' ? 'Back to entity' : 'Back to users'

    return (
      <UserDetailsPage
        userId={params.userId}
        initialTab={search.tab}
        backLabel={backLabel}
        onBack={() => {
          if (search.source === 'entities') {
            const entitySearch = {
              search: search.sourceSearch,
              scopeRootId: search.sourceScopeRootId,
            }

            if (search.sourceEntityId) {
              void navigate({
                to: routes.app.entityDetail,
                params: {
                  entityId: search.sourceEntityId,
                },
                search: entitySearch,
              })
              return
            }

            void navigate({
              to: routes.app.entities,
              search: entitySearch,
            })
            return
          }

          void navigate({
            to: routes.app.users,
            search: usersSearch,
          })
        }}
        onDeleted={() => {
          void navigate({
            to: routes.app.userDetail,
            params: {
              userId: params.userId,
            },
            search,
            replace: true,
          })
        }}
      />
    )
  },
})
