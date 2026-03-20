export type ApiKeyStatus = 'active' | 'suspended' | 'revoked' | 'expired'

export type ApiKey = {
  id: string
  prefix: string
  name: string
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
  owner_id?: string | null
}

export type CreateApiKeyInput = {
  name: string
  scopes?: string[]
  prefix_type?: string
  ip_whitelist?: string[]
  rate_limit_per_minute?: number
  expires_in_days?: number
  description?: string | null
  entity_ids?: string[]
}

export type CreateApiKeyResponse = ApiKey & {
  api_key: string
}

export type UpdateApiKeyInput = {
  keyId: string
  name?: string
  scopes?: string[]
  ip_whitelist?: string[] | null
  rate_limit_per_minute?: number
  status?: Exclude<ApiKeyStatus, 'expired'>
  description?: string | null
  entity_ids?: string[] | null
}

export type RotateApiKeyInput = {
  keyId: string
}
