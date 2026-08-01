import { useEffect } from 'react'

import {
  Outlet,
  createFileRoute,
  redirect,
} from '@tanstack/react-router'

import { AppLoadingState } from '@/components/app/app-loading-state'
import { AppShell } from '@/app/layouts/app-shell'
import { getSessionQueryOptions } from '@/features/auth/api/auth.query-options'
import { useLogoutMutation } from '@/features/auth/hooks/use-logout-mutation'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import type { SessionUser } from '@/features/auth/types/auth.types'
import { hasStoredAuthTokens } from '@/lib/api/auth-token'
import { expireAuthSession } from '@/lib/api/auth-session'
import { ApiError, getApiErrorMessage } from '@/lib/api/errors'
import { routes } from '@/lib/constants/routes'

function getUserDisplayName(user: SessionUser) {
  const displayName = [user.first_name, user.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()

  if (displayName) {
    return displayName
  }

  return user.email.split('@')[0] || 'User'
}

function AppLayout() {
  const sessionQuery = useSessionQuery()
  const logoutMutation = useLogoutMutation()

  useEffect(() => {
    if (!(sessionQuery.error instanceof ApiError) || sessionQuery.error.status !== 401) {
      return
    }

    expireAuthSession()
  }, [sessionQuery.error])

  if (sessionQuery.isPending) {
    return (
      <AppLoadingState
        title="Loading workspace"
        description="Checking the current auth session."
      />
    )
  }

  if (sessionQuery.isError) {
    if (sessionQuery.error instanceof ApiError && sessionQuery.error.status === 401) {
      return (
        <AppLoadingState
          title="Redirecting"
          description="Your session expired. Sending you back to login."
        />
      )
    }

    return (
      <div className="flex min-h-[40svh] max-w-xl flex-col justify-center gap-3 px-4">
        <p className="text-xs font-semibold tracking-[0.24em] text-muted-foreground uppercase">
          Workspace unavailable
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Could not load the current session.
        </h1>
        <p className="text-sm text-muted-foreground">
          {getApiErrorMessage(
            sessionQuery.error,
            'The auth API is unavailable or returned an unexpected error.'
          )}
        </p>
      </div>
    )
  }

  const user = sessionQuery.data

  return (
    <AppShell
      name={getUserDisplayName(user)}
      email={user.email}
      isLoggingOut={logoutMutation.isPending}
      onLogout={() => {
        logoutMutation.mutate()
      }}
    >
      <Outlet />
    </AppShell>
  )
}

export const Route = createFileRoute('/app')({
  beforeLoad: async ({ context }) => {
    if (!hasStoredAuthTokens()) {
      throw redirect({
        to: routes.auth.login,
      })
    }

    try {
      await context.queryClient.ensureQueryData(getSessionQueryOptions())
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        expireAuthSession()
        context.queryClient.clear()

        throw redirect({
          to: routes.auth.login,
        })
      }

      throw error
    }
  },
  component: AppLayout,
})
