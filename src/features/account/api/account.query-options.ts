import { queryOptions } from '@tanstack/react-query'

import { accountKeys } from '@/features/account/api/account.keys'
import { getMySessions } from '@/features/account/api/get-my-sessions'
import { getMySocialAccounts } from '@/features/account/api/get-my-social-accounts'

export function getMySessionsQueryOptions() {
  return queryOptions({
    queryKey: accountKeys.sessions(),
    queryFn: ({ signal }) => getMySessions({ signal }),
  })
}

export function getMySocialAccountsQueryOptions() {
  return queryOptions({
    queryKey: accountKeys.socialAccounts(),
    queryFn: ({ signal }) => getMySocialAccounts({ signal }),
  })
}
