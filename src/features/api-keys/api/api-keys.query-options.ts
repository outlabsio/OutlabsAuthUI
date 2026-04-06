import { queryOptions } from '@tanstack/react-query'

import { apiKeysKeys } from '@/features/api-keys/api/api-keys.keys'
import { getGrantableScopes } from '@/features/api-keys/api/get-grantable-scopes'
import { getApiKeys } from '@/features/api-keys/api/get-api-keys'
import { getMyApiKeys } from '@/features/api-keys/api/get-my-api-keys'
import {
  getIntegrationPrincipalApiKeys,
  getIntegrationPrincipals,
} from '@/features/api-keys/api/integration-principals'
import type {
  GetGrantableScopesInput,
  ListIntegrationPrincipalApiKeysParams,
  ListIntegrationPrincipalsParams,
  ListEntityApiKeysParams,
} from '@/features/api-keys/types/api-keys.types'

export function getMyApiKeysQueryOptions() {
  return queryOptions({
    queryKey: apiKeysKeys.list({ scope: 'self' }),
    queryFn: () => getMyApiKeys(),
  })
}

export function getGrantableScopesQueryOptions(params: GetGrantableScopesInput) {
  return queryOptions({
    queryKey: apiKeysKeys.grantableScopes(params),
    queryFn: () => getGrantableScopes(params),
  })
}

export function getEntityApiKeysQueryOptions(params: ListEntityApiKeysParams) {
  return queryOptions({
    queryKey: apiKeysKeys.list(params),
    queryFn: () => getApiKeys(params),
  })
}

export function getIntegrationPrincipalsQueryOptions(params: ListIntegrationPrincipalsParams) {
  return queryOptions({
    queryKey: apiKeysKeys.principalsList(params),
    queryFn: () => getIntegrationPrincipals(params),
  })
}

export function getIntegrationPrincipalApiKeysQueryOptions(
  params: ListIntegrationPrincipalApiKeysParams
) {
  return queryOptions({
    queryKey: apiKeysKeys.principalKeyList(params),
    queryFn: () => getIntegrationPrincipalApiKeys(params),
  })
}
