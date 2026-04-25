import { RouterProvider as TanStackRouterProvider } from '@tanstack/react-router'
import { useEffect } from 'react'

import { router } from '@/app/router'
import { authSessionExpiredEvent } from '@/lib/api/auth-session'
import { hasStoredAuthTokens, isAuthTokenStorageKey } from '@/lib/api/auth-token'
import { routes } from '@/lib/constants/routes'
import { queryClient } from '@/lib/query/query-client'

export function RouterProvider() {
  useEffect(() => {
    function handleSessionExpired() {
      queryClient.clear()

      void router.navigate({
        to: routes.auth.login,
        replace: true,
      })
    }

    window.addEventListener(authSessionExpiredEvent, handleSessionExpired)

    function handleTokenStorageChange(event: StorageEvent) {
      if (!isAuthTokenStorageKey(event.key) || hasStoredAuthTokens()) {
        return
      }

      handleSessionExpired()
    }

    window.addEventListener('storage', handleTokenStorageChange)

    return () => {
      window.removeEventListener(authSessionExpiredEvent, handleSessionExpired)
      window.removeEventListener('storage', handleTokenStorageChange)
    }
  }, [])

  return <TanStackRouterProvider router={router} />
}
