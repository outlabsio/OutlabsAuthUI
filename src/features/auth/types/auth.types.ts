export type LoginCredentials = {
  email: string
  password: string
}

export type AuthTokens = {
  access_token: string
  refresh_token: string
  token_type?: string
}

export type SessionUser = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  is_superuser?: boolean
  root_entity_id?: string | null
  root_entity_name?: string | null
}

export type AuthConfigPermission = {
  value: string
  label: string
  category: string
}

export type AuthConfig = {
  preset: string
  features: {
    entity_hierarchy: boolean
    context_aware_roles: boolean
    abac: boolean
    tree_permissions: boolean
    api_keys: boolean
    user_status: boolean
    activity_tracking: boolean
    invitations: boolean
  }
  available_permissions: AuthConfigPermission[]
}
