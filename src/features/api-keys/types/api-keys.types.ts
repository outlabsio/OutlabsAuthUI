import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

export type ApiKeyStatus = 'active' | 'suspended' | 'revoked' | 'expired'
export type ApiKeyKind = 'personal'

export type ApiKey = {
  id: string
  prefix: string
  name: string
  key_kind: ApiKeyKind
  scopes: string[]
  ip_whitelist?: string[] | null
  rate_limit_per_minute: number
  status: ApiKeyStatus
  usage_count: number
  created_at: string
  expires_at?: string | null
  last_used_at?: string | null
  description?: string | null
  entity_ids?: string[] | null
  inherit_from_tree?: boolean
  owner_id?: string | null
  is_currently_effective?: boolean | null
  ineffective_reasons?: string[] | null
}

export type ApiKeysListResponse = PaginatedResponse<ApiKey>

export type ListEntityApiKeysParams = {
  entityId: string
  page?: number
  limit?: number
  ownerId?: string
  status?: ApiKeyStatus
  keyKind?: ApiKeyKind
  search?: string
}

export type ApiKeyGrantableScopes = {
  actor_user_id: string
  owner_id: string
  entity_id: string
  key_kind: ApiKeyKind
  inherit_from_tree: boolean
  allowed_key_kinds: ApiKeyKind[]
  personal_allowed_action_prefixes: string[]
  grantable_scopes: string[]
}

export type GetGrantableScopesInput = {
  entityId: string
  ownerId?: string
  keyKind?: ApiKeyKind
  inherit_from_tree?: boolean
}

export type CreateApiKeyInput = {
  entityId: string
  owner_id: string
  name: string
  scopes?: string[]
  prefix_type?: string
  ip_whitelist?: string[]
  rate_limit_per_minute?: number
  expires_in_days?: number
  description?: string | null
  key_kind?: ApiKeyKind
  inherit_from_tree?: boolean
}

export type CreateApiKeyResponse = ApiKey & {
  api_key: string
}

export type UpdateApiKeyInput = {
  entityId: string
  keyId: string
  name?: string
  scopes?: string[]
  ip_whitelist?: string[] | null
  rate_limit_per_minute?: number
  status?: Exclude<ApiKeyStatus, 'expired'>
  description?: string | null
  inherit_from_tree?: boolean
}

export type RotateApiKeyInput = {
  entityId: string
  keyId: string
}

export type DeleteApiKeyInput = {
  entityId: string
  keyId: string
}
