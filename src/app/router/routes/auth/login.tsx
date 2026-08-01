import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'

import { LoginPage } from '@/features/auth/components/login-page'
import { hasStoredAuthTokens } from '@/lib/api/auth-token'
import { routes } from '@/lib/constants/routes'

const loginSearchSchema = z.object({
  oauth_error: z.string().optional(),
})

export const Route = createFileRoute('/auth/login')({
  validateSearch: (search) => loginSearchSchema.parse(search),
  beforeLoad: () => {
    if (hasStoredAuthTokens()) {
      throw redirect({
        to: routes.app.dashboard,
      })
    }
  },
  component: LoginPage,
})
