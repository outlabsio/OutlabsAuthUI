import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'

import { NotFoundPage } from '@/app/pages/not-found-page'
import type { AppRouterContext } from '@/app/router'

function RootComponent() {
  return <Outlet />
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
})
