import { queryOptions } from '@tanstack/react-query'

import { getAuthConfig } from '@/features/auth/api/get-auth-config'
import { authKeys } from '@/features/auth/api/auth.keys'
import { getMyPermissions } from '@/features/auth/api/get-my-permissions'
import { getSession } from '@/features/auth/api/get-session'

export function getAuthConfigQueryOptions() {
  return queryOptions({
    queryKey: authKeys.config(),
    queryFn: getAuthConfig,
    staleTime: 5 * 60_000,
  })
}

export function getSessionQueryOptions() {
  return queryOptions({
    queryKey: authKeys.session(),
    queryFn: getSession,
  })
}

export function getMyPermissionsQueryOptions() {
  return queryOptions({
    queryKey: authKeys.myPermissions(),
    queryFn: getMyPermissions,
  })
}
