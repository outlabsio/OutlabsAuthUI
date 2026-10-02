import { defineQueryOptions, useMutation } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { CATALOGUE_STALE_TIME } from '~/queries/freshness'
import { useInvalidateAfter } from '~/queries/invalidation'
import type { PaginatedResponse } from '~/types/auth'
import type {
  ApiKey,
  ApiKeyGrantableScopes,
  CreateApiKeyInput,
  CreateApiKeyResponse,
  CreateMachineKeyInput,
  CreatePrincipalInput,
  IntegrationPrincipal,
  IntegrationPrincipalsListResponse,
  KeyInventoryFilters,
  PrincipalKeysCollection,
  PrincipalListFilters,
  UpdateApiKeyInput,
  UpdatePrincipalInput
} from '~/types/api-key'
import { collectAllPages } from '~/utils/pagination'
import type { ServiceAccountScope } from '~/utils/service-accounts'
import { useSecretMutation } from './secret-mutation'

// Personal API keys vertical. GET /api-keys returns a flat array (not a paginated envelope).
// Mutations invalidate on settle without awaiting it (invalidateAfter), so a failed refetch never
// hides a successful create/rotate. Create + rotate return the one-time plaintext secret
// (CreateApiKeyResponse.api_key), surfaced once by AppSecretReveal: they are secret mutations
// (./secret-mutation.ts), and the caller calls `discard()` as soon as the secret is in the
// AppSecretReveal model, so the mutation cache does not keep it.

const API_KEYS_ROOT = 'api-keys' as const

export const myApiKeysQuery = defineQueryOptions({
  key: [API_KEYS_ROOT, 'mine'],
  // Trailing slash: the route is /api-keys/, and /api-keys answers with a 307 redirect.
  query: ctx => apiClient.get<ApiKey[]>('/api-keys/', { signal: ctx?.signal })
})

// One personal key (GET /api-keys/{id}): the key detail re-reads it while open.
export const apiKeyDetailQuery = defineQueryOptions((keyId: string) => ({
  key: [API_KEYS_ROOT, 'detail', keyId],
  query: ctx => apiClient.get<ApiKey>(`/api-keys/${keyId}`, { signal: ctx?.signal })
}))

export type GrantableScopesInput = { entityId?: string | null, inheritFromTree?: boolean }

function grantableScopesParams({ entityId, inheritFromTree }: GrantableScopesInput) {
  const params = new URLSearchParams({ inherit_from_tree: String(Boolean(entityId) && Boolean(inheritFromTree)) })
  if (entityId) params.set('entity_id', entityId)
  return params.toString()
}

// The scopes the current actor may grant to a personal key (the mint and edit scope pickers),
// unrestricted or restricted to one entity (and its children with inherit_from_tree), plus the
// action prefixes personal keys allow.
export const grantableScopesQuery = defineQueryOptions((input: GrantableScopesInput = {}) => ({
  key: [API_KEYS_ROOT, 'grantable-scopes', input.entityId || 'none', Boolean(input.entityId) && Boolean(input.inheritFromTree)],
  query: ctx => apiClient.get<ApiKeyGrantableScopes>(`/api-keys/grantable-scopes?${grantableScopesParams(input)}`, { signal: ctx?.signal }),
  staleTime: CATALOGUE_STALE_TIME
}))

export function useCreateApiKey() {
  const invalidate = useInvalidateAfter()
  return useSecretMutation({
    // Trailing slash: POST /api-keys 307-redirects and can drop the body.
    mutation: (input: CreateApiKeyInput) => apiClient.post<CreateApiKeyResponse>('/api-keys/', { body: input }),
    onSettled: () => invalidate('apiKey')
  })
}

export function useRotateApiKey() {
  const invalidate = useInvalidateAfter()
  return useSecretMutation({
    mutation: (keyId: string) => apiClient.post<CreateApiKeyResponse>(`/api-keys/${keyId}/rotate`),
    onSettled: () => invalidate('apiKey')
  })
}

export function useRevokeApiKey() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: (keyId: string) => apiClient.delete<undefined>(`/api-keys/${keyId}`),
    onSettled: () => invalidate('apiKey')
  })
}

// Partial update: Edit (name, description, scopes, IP allowlist, rate limit, entity restriction;
// only changed fields) and suspend/reactivate (status active↔suspended).
export function useUpdateApiKey() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ keyId, input }: { keyId: string, input: UpdateApiKeyInput }) =>
      apiClient.patch<ApiKey>(`/api-keys/${keyId}`, { body: input }),
    onSettled: () => invalidate('apiKey')
  })
}

// ── Service accounts (integration principals) and their keys ──
// Platform-wide:       /admin/system/integration-principals[...] (superuser-only on EnterpriseRBAC;
//                      api_key:* on SimpleRBAC).
// Anchored at entity:  /admin/entities/{entityId}/integration-principals[...] (api_key:*_tree).
// Key create and rotate return the one-time plaintext: secret mutations, discarded by the caller
// right after it fills the AppSecretReveal model (F-183).
const PRINCIPALS_ROOT = 'system-principals' as const

function principalsBase(scope: ServiceAccountScope): string {
  return scope.kind === 'entity'
    ? `/admin/entities/${scope.entityId}/integration-principals`
    : '/admin/system/integration-principals'
}

function scopeKey(scope: ServiceAccountScope) {
  return scope.kind === 'entity' ? `entity:${scope.entityId}` : 'platform'
}

export const principalKeys = {
  root: [PRINCIPALS_ROOT],
  list: (scope: ServiceAccountScope, filters: PrincipalListFilters) => [PRINCIPALS_ROOT, 'list', scopeKey(scope), filters],
  detail: (scope: ServiceAccountScope, principalId: string) => [PRINCIPALS_ROOT, 'detail', scopeKey(scope), principalId],
  keys: (scope: ServiceAccountScope, principalId: string) => [PRINCIPALS_ROOT, 'detail', scopeKey(scope), principalId, 'keys'],
  inventory: (entityId: string, filters: KeyInventoryFilters) => [PRINCIPALS_ROOT, 'inventory', entityId, filters]
} as const

function principalListQueryString(filters: PrincipalListFilters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) })
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  return params.toString()
}

// One page of service accounts, searched and filtered by the server (name or description).
export const principalsQuery = defineQueryOptions(({ scope, filters }: { scope: ServiceAccountScope, filters: PrincipalListFilters }) => ({
  key: principalKeys.list(scope, filters),
  query: ctx => apiClient.get<IntegrationPrincipalsListResponse>(`${principalsBase(scope)}?${principalListQueryString(filters)}`, { signal: ctx?.signal })
}))

export const principalDetailQuery = defineQueryOptions(({ scope, principalId }: { scope: ServiceAccountScope, principalId: string }) => ({
  key: principalKeys.detail(scope, principalId),
  query: ctx => apiClient.get<IntegrationPrincipal>(`${principalsBase(scope)}/${principalId}`, { signal: ctx?.signal })
}))

// Every key of one account, all statuses and pages (accounts carry few keys; the walk stops at
// 2000 and says so), so the Keys tab can show live keys by default with true counts.
const KEYS_PAGE_SIZE = 100
export const principalKeysQuery = defineQueryOptions(({ scope, principalId }: { scope: ServiceAccountScope, principalId: string }) => ({
  key: principalKeys.keys(scope, principalId),
  query: async (ctx): Promise<PrincipalKeysCollection> => {
    const collected = await collectAllPages<ApiKey>(
      (page, limit) => apiClient.get<PaginatedResponse<ApiKey>>(`${principalsBase(scope)}/${principalId}/api-keys?page=${page}&limit=${limit}`, { signal: ctx?.signal }),
      { pageSize: KEYS_PAGE_SIZE, maxPages: 20 }
    )
    return { items: collected.items, total: collected.total, complete: collected.complete }
  }
}))

function inventoryQueryString(filters: KeyInventoryFilters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: String(filters.limit) })
  if (filters.search) params.set('search', filters.search)
  if (filters.status) params.set('status', filters.status)
  if (filters.keyKind) params.set('key_kind', filters.keyKind)
  return params.toString()
}

// Key inventory of one entity (api_key_admin router): every key anchored exactly at it, personal
// and service-account keys, for inventory and incident response. Children are not included.
export const entityKeyInventoryQuery = defineQueryOptions(({ entityId, filters }: { entityId: string, filters: KeyInventoryFilters }) => ({
  key: principalKeys.inventory(entityId, filters),
  query: ctx => apiClient.get<PaginatedResponse<ApiKey>>(`/admin/entities/${entityId}/api-keys?${inventoryQueryString(filters)}`, { signal: ctx?.signal })
}))

export function useCreatePrincipal() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ scope, input }: { scope: ServiceAccountScope, input: CreatePrincipalInput }) =>
      apiClient.post<IntegrationPrincipal>(principalsBase(scope), { body: { ...input, role_ids: input.role_ids ?? [] } }),
    onSettled: () => invalidate('principal')
  })
}

// Edit, deactivate (status inactive: the API revokes every key) and reactivate.
export function useUpdatePrincipal() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ scope, principalId, input }: { scope: ServiceAccountScope, principalId: string, input: UpdatePrincipalInput }) =>
      apiClient.patch<IntegrationPrincipal>(`${principalsBase(scope)}/${principalId}`, { body: input }),
    onSettled: () => invalidate('principal')
  })
}

// DELETE archives the account and revokes every key it owns.
export function useArchivePrincipal() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ scope, principalId }: { scope: ServiceAccountScope, principalId: string }) =>
      apiClient.delete<undefined>(`${principalsBase(scope)}/${principalId}`),
    onSettled: () => invalidate('principal')
  })
}

export function useCreateMachineKey() {
  const invalidate = useInvalidateAfter()
  return useSecretMutation({
    mutation: ({ scope, principalId, input }: { scope: ServiceAccountScope, principalId: string, input: CreateMachineKeyInput }) =>
      apiClient.post<CreateApiKeyResponse>(`${principalsBase(scope)}/${principalId}/api-keys`, { body: input }),
    onSettled: () => invalidate('principal')
  })
}

export function useRotateMachineKey() {
  const invalidate = useInvalidateAfter()
  return useSecretMutation({
    mutation: ({ scope, principalId, keyId }: { scope: ServiceAccountScope, principalId: string, keyId: string }) =>
      apiClient.post<CreateApiKeyResponse>(`${principalsBase(scope)}/${principalId}/api-keys/${keyId}/rotate`),
    onSettled: () => invalidate('principal')
  })
}

export function useRevokeMachineKey() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ scope, principalId, keyId }: { scope: ServiceAccountScope, principalId: string, keyId: string }) =>
      apiClient.delete<undefined>(`${principalsBase(scope)}/${principalId}/api-keys/${keyId}`),
    onSettled: () => invalidate('principal')
  })
}

// Partial update for a key of a service account: Edit (only changed fields) and suspend/reactivate.
export function useUpdateMachineKey() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ scope, principalId, keyId, input }: { scope: ServiceAccountScope, principalId: string, keyId: string, input: UpdateApiKeyInput }) =>
      apiClient.patch<ApiKey>(`${principalsBase(scope)}/${principalId}/api-keys/${keyId}`, { body: input }),
    onSettled: () => invalidate('principal')
  })
}

// Incident response: revoke any key anchored at the entity from its inventory (api_key:delete_tree),
// a personal key or a service account's.
export function useRevokeInventoryKey() {
  const invalidate = useInvalidateAfter()
  return useMutation({
    mutation: ({ entityId, keyId }: { entityId: string, keyId: string }) =>
      apiClient.delete<undefined>(`/admin/entities/${entityId}/api-keys/${keyId}`),
    onSettled: () => invalidate('keyInventory')
  })
}
