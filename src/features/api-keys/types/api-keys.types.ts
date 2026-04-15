import type { PaginatedResponse } from '@/lib/api/paginated-response.types'

export type ApiKeyStatus = 'active' | 'suspended' | 'revoked' | 'expired'
export type ApiKeyKind = 'personal' | 'system_integration'
export type ApiKeyOwnerType = 'user' | 'integration_principal'
export type IntegrationPrincipalStatus = 'active' | 'inactive' | 'archived'
export type IntegrationPrincipalScopeKind = 'entity' | 'platform_global'

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
  owner_type?: ApiKeyOwnerType | null
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
  entity_id?: string | null
  key_kind: ApiKeyKind
  inherit_from_tree: boolean
  allowed_key_kinds: ApiKeyKind[]
  personal_allowed_action_prefixes: string[]
  grantable_scopes: string[]
}

export type GetGrantableScopesInput = {
  entityId?: string
  inherit_from_tree?: boolean
}

export type CreateApiKeyInput = {
  name: string
  scopes?: string[]
  prefix_type?: string
  ip_whitelist?: string[]
  rate_limit_per_minute?: number
  expires_in_days?: number
  description?: string | null
  key_kind?: ApiKeyKind
  entity_ids?: string[]
  inherit_from_tree?: boolean
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
  inherit_from_tree?: boolean
}

export type RotateApiKeyInput = {
  keyId: string
}

export type DeleteApiKeyInput = {
  keyId: string
}

export type DeleteEntityApiKeyInput = {
  entityId: string
  keyId: string
}

export type IntegrationPrincipal = {
  id: string
  name: string
  description?: string | null
  status: IntegrationPrincipalStatus
  scope_kind: IntegrationPrincipalScopeKind
  anchor_entity_id?: string | null
  inherit_from_tree: boolean
  allowed_scopes: string[]
  effective_allowed_scopes: string[]
  role_ids: string[]
  created_by_user_id?: string | null
  created_at: string
  updated_at: string
}

export type IntegrationPrincipalsListResponse = PaginatedResponse<IntegrationPrincipal>

export type ListIntegrationPrincipalsParams = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  page?: number
  limit?: number
  status?: IntegrationPrincipalStatus
  search?: string
}

export type CreateIntegrationPrincipalInput = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  name: string
  description?: string | null
  allowed_scopes: string[]
  role_ids?: string[]
  inherit_from_tree?: boolean
}

export type UpdateIntegrationPrincipalInput = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  principalId: string
  name?: string
  description?: string | null
  status?: Exclude<IntegrationPrincipalStatus, 'archived'>
  allowed_scopes?: string[]
  role_ids?: string[]
  inherit_from_tree?: boolean
}

export type DeleteIntegrationPrincipalInput = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  principalId: string
}

export type ListIntegrationPrincipalApiKeysParams = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  principalId: string
  page?: number
  limit?: number
  status?: ApiKeyStatus
  search?: string
}

export type CreateSystemIntegrationApiKeyInput = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  principalId: string
  name: string
  scopes: string[]
  prefix_type?: string
  ip_whitelist?: string[]
  rate_limit_per_minute?: number
  expires_in_days?: number
  description?: string | null
}

export type UpdateSystemIntegrationApiKeyInput = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  principalId: string
  keyId: string
  name?: string
  scopes?: string[]
  ip_whitelist?: string[]
  rate_limit_per_minute?: number
  status?: Exclude<ApiKeyStatus, 'expired'>
  description?: string | null
}

export type RotateSystemIntegrationApiKeyInput = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  principalId: string
  keyId: string
}

export type DeleteSystemIntegrationApiKeyInput = {
  scopeKind: IntegrationPrincipalScopeKind
  entityId?: string
  principalId: string
  keyId: string
}
