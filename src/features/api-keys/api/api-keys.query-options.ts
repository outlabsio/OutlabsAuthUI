import { keepPreviousData, queryOptions } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { getGrantableScopes } from '@/features/api-keys/api/get-grantable-scopes'
import { getApiKeys } from '@/features/api-keys/api/get-api-keys'
import { getMyApiKeys } from '@/features/api-keys/api/get-my-api-keys'
import { getIntegrationPrincipalApiKeys } from '@/features/api-keys/api/get-integration-principal-api-keys'
import { getIntegrationPrincipals } from '@/features/api-keys/api/get-integration-principals'
import type {
  GetGrantableScopesInput,
  ListIntegrationPrincipalApiKeysParams,
  ListIntegrationPrincipalsParams,
  ListEntityApiKeysParams,
} from '@/features/api-keys/types/api-keys.types'

export function getMyApiKeysQueryOptions() {
  return queryOptions({
    queryKey: apiKeysKeys.list({ scope: 'self' }),
    queryFn: ({ signal }) => getMyApiKeys({ signal }),
  })
}

export function getGrantableScopesQueryOptions(params: GetGrantableScopesInput) {
  return queryOptions({
    queryKey: apiKeysKeys.grantableScopes(params),
    queryFn: ({ signal }) => getGrantableScopes(params, { signal }),
  })
}

export function getEntityApiKeysQueryOptions(params: ListEntityApiKeysParams) {
  return queryOptions({
    queryKey: apiKeysKeys.list(params),
    queryFn: ({ signal }) => getApiKeys(params, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function getIntegrationPrincipalsQueryOptions(params: ListIntegrationPrincipalsParams) {
  return queryOptions({
    queryKey: apiKeysKeys.principalsList(params),
    queryFn: ({ signal }) => getIntegrationPrincipals(params, { signal }),
    placeholderData: keepPreviousData,
  })
}

export function getIntegrationPrincipalApiKeysQueryOptions(
  params: ListIntegrationPrincipalApiKeysParams
) {
  return queryOptions({
    queryKey: apiKeysKeys.principalKeyList(params),
    queryFn: ({ signal }) => getIntegrationPrincipalApiKeys(params, { signal }),
    placeholderData: keepPreviousData,
  })
}
