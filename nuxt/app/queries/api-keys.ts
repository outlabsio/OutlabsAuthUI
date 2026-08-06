import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/utils/api'
import type { PaginatedResponse } from '~/types/auth'
import type {
  ApiKey,
  ApiKeyGrantableScopes,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  CreateMachineKeyInput,
  CreatePrincipalInput,
  IntegrationPrincipal,
  IntegrationPrincipalsListResponse
} from '~/types/api-key'

// Personal API keys vertical. GET /api-keys returns a flat array (not a paginated envelope).
// Mutations invalidate the resource root ['api-keys'] on settle. Create + rotate return the
// one-time plaintext secret (CreateApiKeyResponse.api_key), surfaced once by the page.

const API_KEYS_ROOT = 'api-keys' as const

export const myApiKeysQuery = defineQueryOptions({
  key: [API_KEYS_ROOT, 'mine'],
  query: ctx => apiClient.get<ApiKey[]>('/api-keys', { signal: ctx?.signal })
})

// The scopes the current actor may grant to a new personal key (drives the mint scope picker).
export const grantableScopesQuery = defineQueryOptions({
  key: [API_KEYS_ROOT, 'grantable-scopes'],
  query: ctx =>
    apiClient.get<ApiKeyGrantableScopes>('/api-keys/grantable-scopes?inherit_from_tree=false', { signal: ctx?.signal })
})

export function useCreateApiKey() {
  const queryCache = useQueryCache()
  return useMutation({
    // Trailing slash: POST /api-keys 307-redirects and can drop the body.
    mutation: (input: CreateApiKeyInput) => apiClient.post<CreateApiKeyResponse>('/api-keys/', { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [API_KEYS_ROOT] })
  })
}

export function useRotateApiKey() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (keyId: string) => apiClient.post<CreateApiKeyResponse>(`/api-keys/${keyId}/rotate`),
    onSettled: () => queryCache.invalidateQueries({ key: [API_KEYS_ROOT] })
  })
}

export function useRevokeApiKey() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (keyId: string) => apiClient.delete<undefined>(`/api-keys/${keyId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [API_KEYS_ROOT] })
  })
}

// ── System integration: service accounts + machine keys, platform-global OR entity-scoped ──
// Platform-global: /admin/system/integration-principals[...].
// Entity-scoped:   /admin/entities/{entityId}/integration-principals[...].
const PRINCIPALS_ROOT = 'system-principals' as const

export type SystemScope = { kind: 'platform_global' } | { kind: 'entity', entityId: string }

function principalsBase(scope: SystemScope): string {
  return scope.kind === 'entity'
    ? `/admin/entities/${scope.entityId}/integration-principals`
    : '/admin/system/integration-principals'
}

export const principalsQuery = defineQueryOptions((scope: SystemScope) => ({
  key: [PRINCIPALS_ROOT, 'list', scope],
  query: ctx => apiClient.get<IntegrationPrincipalsListResponse>(`${principalsBase(scope)}?page=1&limit=100`, { signal: ctx?.signal })
}))

export const principalKeysQuery = defineQueryOptions(({ scope, principalId }: { scope: SystemScope, principalId: string }) => ({
  key: [PRINCIPALS_ROOT, 'detail', scope, principalId, 'keys'],
  query: ctx => apiClient.get<PaginatedResponse<ApiKey>>(`${principalsBase(scope)}/${principalId}/api-keys?page=1&limit=100`, { signal: ctx?.signal })
}))

// Entity inventory — every machine key under an entity, across its service accounts.
export const entityInventoryQuery = defineQueryOptions((entityId: string) => ({
  key: [PRINCIPALS_ROOT, 'inventory', entityId],
  query: ctx => apiClient.get<PaginatedResponse<ApiKey>>(`/admin/entities/${entityId}/api-keys?page=1&limit=100`, { signal: ctx?.signal })
}))

export function useCreatePrincipal() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ scope, input }: { scope: SystemScope, input: CreatePrincipalInput }) =>
      apiClient.post<IntegrationPrincipal>(principalsBase(scope), { body: { ...input, role_ids: input.role_ids ?? [] } }),
    onSettled: () => queryCache.invalidateQueries({ key: [PRINCIPALS_ROOT] })
  })
}

export function useCreateMachineKey() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ scope, principalId, input }: { scope: SystemScope, principalId: string, input: CreateMachineKeyInput }) =>
      apiClient.post<CreateApiKeyResponse>(`${principalsBase(scope)}/${principalId}/api-keys`, { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [PRINCIPALS_ROOT] })
  })
}

export function useRotateMachineKey() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ scope, principalId, keyId }: { scope: SystemScope, principalId: string, keyId: string }) =>
      apiClient.post<CreateApiKeyResponse>(`${principalsBase(scope)}/${principalId}/api-keys/${keyId}/rotate`),
    onSettled: () => queryCache.invalidateQueries({ key: [PRINCIPALS_ROOT] })
  })
}

export function useRevokeMachineKey() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ scope, principalId, keyId }: { scope: SystemScope, principalId: string, keyId: string }) =>
      apiClient.delete<undefined>(`${principalsBase(scope)}/${principalId}/api-keys/${keyId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [PRINCIPALS_ROOT] })
  })
}
