import { createFileRoute, useNavigate } from '@tanstack/react-router'

import { Route as EntitiesLayoutRoute } from '@/app/router/routes/app/entities'
import { EntitiesPage } from '@/features/entities/components/entities-page'
import { routes } from '@/lib/constants/routes'

function EntitiesIndexRouteComponent() {
  const navigate = useNavigate()
  const search = EntitiesLayoutRoute.useSearch()

  return (
    <EntitiesPage
      search={search}
      onSearchChange={(next) => {
        void navigate({
          to: routes.app.entities,
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
    />
  )
}

export const Route = createFileRoute('/app/entities/')({
  component: EntitiesIndexRouteComponent,
})
