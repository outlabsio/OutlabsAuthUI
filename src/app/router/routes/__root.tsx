import { useEffect } from 'react'

import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import { NotFoundPage } from '@/app/pages/not-found-page'
import { RouteErrorPage } from '@/app/pages/route-error-page'
import type { AppRouterContext } from '@/app/router'
import { clearChunkReloadFlag } from '@/lib/utils/chunk-load-recovery'

function RootComponent() {
  useEffect(() => {
    // A successful root render means the app loaded cleanly, so any earlier
    // chunk-reload guard from a previous failed load no longer applies.
    clearChunkReloadFlag()
  }, [])

  return <Outlet />
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
  errorComponent: RouteErrorPage,
})
