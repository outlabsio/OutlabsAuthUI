import { useQuery } from '@tanstack/react-query'

import { getSessionQueryOptions } from '@/features/auth/api/auth.query-options'
import { getStoredAccessToken } from '@/lib/api/auth-token'

export function useSessionQuery() {
  return useQuery({
    ...getSessionQueryOptions(),
    enabled: Boolean(getStoredAccessToken()),
  })
}
