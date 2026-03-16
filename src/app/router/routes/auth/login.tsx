import { createFileRoute, redirect } from '@tanstack/react-router'
import { LoginPage } from '@/features/auth/components/login-page'
import { hasStoredAuthTokens } from '@/lib/api/auth-token'
import { routes } from '@/lib/constants/routes'

export const Route = createFileRoute('/auth/login')({
  beforeLoad: () => {
    if (hasStoredAuthTokens()) {
      throw redirect({
        to: routes.app.dashboard,
      })
    }
  },
  component: LoginPage,
})
