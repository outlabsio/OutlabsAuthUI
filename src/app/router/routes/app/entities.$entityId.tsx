import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as EntitiesLayoutRoute } from '@/app/router/routes/app/entities'
import { EntitiesPage } from '@/features/entities/components/entities-page'
import { routes } from '@/lib/constants/routes'

function EntityDetailsRouteComponent() {
  const navigate = useNavigate()
  const params = Route.useParams()
  const search = EntitiesLayoutRoute.useSearch()

  return (
    <EntitiesPage
      selectedEntityId={params.entityId}
      search={search}
      onSearchChange={(next) => {
        if (next.scopeRootId !== search.scopeRootId) {
          void navigate({
            to: routes.app.entities,
            search: next,
          })
          return
        }

        void navigate({
          to: routes.app.entityDetail,
          params,
          search: next,
        })
      }}
      onEntitySelect={(entityId) => {
        if (!entityId) {
          void navigate({
            to: routes.app.entities,
            search,
          })
          return
        }

        void navigate({
          to: routes.app.entityDetail,
          params: {
            entityId,
          },
          search,
        })
      }}
      onMemberSelect={(userId, context) => {
        void navigate({
          to: routes.app.userDetail,
          params: {
            userId,
          },
          search: {
            page: 1,
            tab: 'access',
            source: 'entities',
            sourceEntityId: context.entityId,
            sourceScopeRootId: context.search.scopeRootId,
            sourceSearch: context.search.search,
          },
        })
      }}
    />
  )
}

export const Route = createFileRoute('/app/entities/$entityId')({
  component: EntityDetailsRouteComponent,
})
