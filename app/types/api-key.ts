import type { PaginatedResponse } from '~/types/auth'
import type { RequestBody, ResponseBody, Schemas } from '~/types/wire'

// API keys: the current actor's PERSONAL keys (GET /api-keys, mint/rotate/revoke) and the
// service accounts (outlabs-auth "integration principals", platform-wide or anchored at an entity)
// with their keys, plus the per-entity key inventory.

export type ApiKeyStatus = Schemas['APIKeyStatus']
export type ApiKeyKind = Schemas['APIKeyKind']

// Metadata only: the plaintext secret is never part of a key read. Carries effectiveness
// (is_currently_effective, ineffective_reasons), anchoring (entity_ids) and ownership.
export type ApiKey = ResponseBody<Schemas['ApiKeyResponse']>

// Personal-key mint payload. key_kind 'personal'; on EnterpriseRBAC optionally restricted to one
// entity (entity_ids: [id]) and its children (inherit_from_tree).
export type CreateApiKeyInput = Pick<
  RequestBody<Schemas['ApiKeyCreateRequest'], 'name' | 'scopes'>,
  'name' | 'scopes' | 'description' | 'rate_limit_per_minute' | 'expires_in_days' | 'key_kind' | 'prefix_type' | 'ip_whitelist' | 'entity_ids' | 'inherit_from_tree'
>

// Partial update (PATCH), changed fields only. Personal keys (/api-keys/{id}) also take the
// entity restriction (entity_ids: [] clears it); machine keys (…/integration-principals/{pid}/
// api-keys/{id}) inherit theirs from the service account and never send it.
export type UpdateApiKeyInput = Pick<
  RequestBody<Schemas['ApiKeyUpdateRequest']>,
  'status' | 'name' | 'description' | 'scopes' | 'rate_limit_per_minute' | 'ip_whitelist' | 'entity_ids' | 'inherit_from_tree'
>

// Create + rotate return the full key PLUS the plaintext secret — shown to the user exactly
// once, then never retrievable again.
export type CreateApiKeyResponse = ResponseBody<Schemas['ApiKeyCreateResponse']>

// A plaintext secret held only while AppSecretReveal shows it (the component clears it when
// the dialog closes). `name`/`prefix`/`expiresAt` identify which key it belongs to.
export type OneTimeSecret = {
  secret: string
  name: string
  prefix?: string | null
  expiresAt?: string | null
  // Who the key acts as: the signed-in user's email for a personal key, the service account's
  // name for a machine key.
  owner?: string | null
}

// GET /api-keys/grantable-scopes — the scopes the current actor may grant to a new key.
export type ApiKeyGrantableScopes = ResponseBody<Schemas['ApiKeyGrantableScopesResponse']>

// ── Service accounts (integration principals) and their keys ──
// Platform-wide: /admin/system/integration-principals. Anchored at an entity (EnterpriseRBAC):
// /admin/entities/{id}/integration-principals. Same shapes on both.

export type IntegrationPrincipalStatus = Schemas['IntegrationPrincipalStatus']

export type IntegrationPrincipal = ResponseBody<Schemas['IntegrationPrincipalResponse']>

export type IntegrationPrincipalsListResponse = PaginatedResponse<IntegrationPrincipal>

export type CreatePrincipalInput = Pick<
  RequestBody<Schemas['IntegrationPrincipalCreateRequest'], 'name' | 'allowed_scopes'>,
  'name' | 'description' | 'allowed_scopes' | 'role_ids' | 'inherit_from_tree'
>

// PATCH: name, description, status (active | inactive), roles, direct scopes, inherit_from_tree.
export type UpdatePrincipalInput = RequestBody<Schemas['IntegrationPrincipalUpdateRequest']>

export type PrincipalListFilters = {
  page: number
  limit: number
  search?: string
  // Omitted = every status.
  status?: IntegrationPrincipalStatus
}

export type CreateMachineKeyInput = RequestBody<Schemas['SystemIntegrationApiKeyCreateRequest'], 'name' | 'scopes'>

// Every key of one service account (all pages), for the account's Keys tab.
export type PrincipalKeysCollection = {
  items: ApiKey[]
  total: number
  // False when the walk stopped early (more keys than the console reads).
  complete: boolean
}

// GET /admin/entities/{id}/api-keys: every key anchored exactly at the entity (personal and
// service-account keys; keys of child entities are not included).
export type KeyInventoryFilters = {
  page: number
  limit: number
  search?: string
  status?: ApiKeyStatus
  keyKind?: ApiKeyKind
}
