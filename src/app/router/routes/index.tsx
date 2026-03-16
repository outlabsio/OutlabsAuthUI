import { createFileRoute, redirect } from '@tanstack/react-router'
import { hasStoredAuthTokens } from '@/lib/api/auth-token'
import { routes } from '@/lib/constants/routes'

export const Route = createFileRoute('/')({
  beforeLoad: () => {
    if (hasStoredAuthTokens()) {
      throw redirect({
        to: routes.app.dashboard,
      })
    }

    throw redirect({
      to: routes.auth.login,
    })
  },
})
