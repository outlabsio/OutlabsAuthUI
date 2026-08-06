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

// ── System integration: platform-global service accounts + machine keys ──
// Paths: /admin/system/integration-principals[/{id}[/api-keys[/{keyId}[/rotate]]]].
const PRINCIPALS_ROOT = 'system-principals' as const
const SYSTEM_BASE = '/admin/system/integration-principals'

export const systemPrincipalsQuery = defineQueryOptions({
  key: [PRINCIPALS_ROOT, 'list'],
  query: ctx => apiClient.get<IntegrationPrincipalsListResponse>(`${SYSTEM_BASE}?page=1&limit=100`, { signal: ctx?.signal })
})

export const principalKeysQuery = defineQueryOptions((principalId: string) => ({
  key: [PRINCIPALS_ROOT, 'detail', principalId, 'keys'],
  query: ctx => apiClient.get<PaginatedResponse<ApiKey>>(`${SYSTEM_BASE}/${principalId}/api-keys?page=1&limit=100`, { signal: ctx?.signal })
}))

export function useCreatePrincipal() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: CreatePrincipalInput) =>
      apiClient.post<IntegrationPrincipal>(SYSTEM_BASE, { body: { ...input, role_ids: [] } }),
    onSettled: () => queryCache.invalidateQueries({ key: [PRINCIPALS_ROOT] })
  })
}

export function useCreateMachineKey() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ principalId, input }: { principalId: string, input: CreateMachineKeyInput }) =>
      apiClient.post<CreateApiKeyResponse>(`${SYSTEM_BASE}/${principalId}/api-keys`, { body: input }),
    onSettled: () => queryCache.invalidateQueries({ key: [PRINCIPALS_ROOT] })
  })
}

export function useRotateMachineKey() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ principalId, keyId }: { principalId: string, keyId: string }) =>
      apiClient.post<CreateApiKeyResponse>(`${SYSTEM_BASE}/${principalId}/api-keys/${keyId}/rotate`),
    onSettled: () => queryCache.invalidateQueries({ key: [PRINCIPALS_ROOT] })
  })
}

export function useRevokeMachineKey() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: ({ principalId, keyId }: { principalId: string, keyId: string }) =>
      apiClient.delete<undefined>(`${SYSTEM_BASE}/${principalId}/api-keys/${keyId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [PRINCIPALS_ROOT] })
  })
}
