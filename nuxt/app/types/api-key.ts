// Ported from the React api-keys feature (src/features/api-keys/types). The workspace here
// lists the current actor's keys (GET /api-keys). Entity-scoped keys, integration
// principals, rotation and the scope-grant flow are a later P2+ pass (need a scope picker).

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
