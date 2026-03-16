import { RouterProvider as TanStackRouterProvider } from '@tanstack/react-router'

import { createAppRouter } from '@/app/router'

const router = createAppRouter()

export function RouterProvider() {
  return <TanStackRouterProvider router={router} />
}
