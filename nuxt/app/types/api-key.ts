// Ported from the React api-keys feature (src/features/api-keys/types). The workspace here
// covers the current actor's PERSONAL keys: list (GET /api-keys), mint (POST /api-keys/),
// rotate (POST /api-keys/{id}/rotate), and revoke (DELETE /api-keys/{id}). Entity-anchored
// keys, system-integration keys and integration principals are a separate, larger surface.

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
