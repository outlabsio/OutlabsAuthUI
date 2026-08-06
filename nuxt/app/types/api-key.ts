import type { PaginatedResponse } from '~/types/auth'

// Ported from the React api-keys feature (src/features/api-keys/types). Covers the current
// actor's PERSONAL keys (GET /api-keys, mint/rotate/revoke) AND the platform-global
// system-integration surface: service accounts (integration principals) + their machine keys.
// Entity-anchored/entity-scoped variants + role envelopes remain a further pass.

export type ApiKeyStatus = 'active' | 'suspended' | 'revoked' | 'expired'
export type ApiKeyKind = 'personal' | 'system_integration'

export type ApiKey = {
  id: string
  prefix: string
  name: string
  key_kind: ApiKeyKind
  scopes: string[]
  rate_limit_per_minute: number
  status: ApiKeyStatus
  usage_count: number
  created_at: string
  expires_at?: string | null
  last_used_at?: string | null
  description?: string | null
}

// Personal-key mint payload. key_kind defaults to 'personal'; entity anchoring is omitted
// (unanchored personal keys — verified against the backend).
export type CreateApiKeyInput = {
  name: string
  scopes: string[]
  description?: string | null
  rate_limit_per_minute?: number
  expires_in_days?: number
  key_kind?: ApiKeyKind
}

// Create + rotate return the full key PLUS the plaintext secret — shown to the user exactly
// once, then never retrievable again.
export type CreateApiKeyResponse = ApiKey & { api_key: string }

// GET /api-keys/grantable-scopes — the scopes the current actor may grant to a new key.
export type ApiKeyGrantableScopes = {
  actor_user_id: string
  owner_id: string
  key_kind: ApiKeyKind
  allowed_key_kinds: ApiKeyKind[]
  personal_allowed_action_prefixes: string[]
  grantable_scopes: string[]
}

// ── System integration: service accounts (integration principals) + machine keys ──
// This slice covers the PLATFORM-GLOBAL scope (/admin/system/integration-principals). The
// entity-scoped variant (/admin/entities/{id}/integration-principals) + role envelopes land
// in a later pass.

export type IntegrationPrincipalStatus = 'active' | 'inactive' | 'archived'

export type IntegrationPrincipal = {
  id: string
  name: string
  description?: string | null
  status: IntegrationPrincipalStatus
  scope_kind: 'entity' | 'platform_global'
  anchor_entity_id?: string | null
  inherit_from_tree: boolean
  allowed_scopes: string[]
  effective_allowed_scopes: string[]
  role_ids: string[]
  created_at: string
}

export type IntegrationPrincipalsListResponse = PaginatedResponse<IntegrationPrincipal>

export type CreatePrincipalInput = {
  name: string
  description?: string | null
  allowed_scopes: string[]
  role_ids?: string[]
  inherit_from_tree?: boolean
}

export type CreateMachineKeyInput = {
  name: string
  scopes: string[]
  description?: string | null
  rate_limit_per_minute?: number
  expires_in_days?: number
}
