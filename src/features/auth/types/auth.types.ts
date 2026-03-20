export type LoginCredentials = {
  email: string
  password: string
}

export type ForgotPasswordInput = {
  email: string
}

export type ResetPasswordInput = {
  token: string
  new_password: string
}

export type AcceptInviteInput = {
  token: string
  new_password: string
}

export type AuthTokens = {
  access_token: string
  refresh_token: string
  expires_in?: number
  token_type?: string
}

export type SessionUser = {
  id: string
  email: string
  first_name?: string | null
  last_name?: string | null
  status: 'active' | 'invited' | 'suspended' | 'banned' | 'deleted'
  email_verified: boolean
  is_superuser?: boolean
  avatar_url?: string | null
  phone?: string | null
  locale?: string | null
  timezone?: string | null
  root_entity_id?: string | null
  root_entity_name?: string | null
  created_at?: string | null
  updated_at?: string | null
  last_login?: string | null
  last_activity?: string | null
  last_password_change?: string | null
  suspended_until?: string | null
  locked_until?: string | null
  deleted_at?: string | null
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
  available_permissions: string[]
}
