import { useMemo } from 'react'

import { useQuery } from '@tanstack/react-query'

import { getMyPermissionsQueryOptions } from '@/features/auth/api/auth.query-options'
import { useSessionQuery } from '@/features/auth/hooks/use-session-query'
import { hasAnyPermission } from '@/features/auth/utils/has-any-permission'

export function useActorPermissions() {
  const sessionQuery = useSessionQuery()
  const sessionUser = sessionQuery.data ?? null
  const isSuperuser = Boolean(sessionUser?.is_superuser)
  const permissionsQuery = useQuery({
    ...getMyPermissionsQueryOptions(),
    enabled: Boolean(sessionUser?.id),
  })
  const permissionNames = useMemo(
    () => new Set(permissionsQuery.data ?? []),
    [permissionsQuery.data]
  )

  function has(permissionName: string) {
    return isSuperuser || permissionNames.has(permissionName)
  }

  function hasAny(candidates: string[]) {
    return isSuperuser || hasAnyPermission(permissionNames, candidates)
  }

  /** Conservative check: non-superusers require a successful permissions load. */
  function allows(candidates: string[]) {
    if (isSuperuser) {
      return true
    }

    if (!permissionsQuery.isSuccess) {
      return false
    }

    return hasAnyPermission(permissionNames, candidates)
  }

  return {
    sessionUser,
    isSuperuser,
    permissionNames,
    isPending:
      sessionQuery.isPending ||
      (Boolean(sessionUser?.id) && permissionsQuery.isPending),
    isSuccess: permissionsQuery.isSuccess,
    isError: sessionQuery.isError || permissionsQuery.isError,
    error: sessionQuery.error ?? permissionsQuery.error,
    has,
    hasAny,
    allows,
  }
}
