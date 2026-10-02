import type { Narrow, RequestBody, ResponseBody, Schemas } from '~/types/wire'
import type { UserStatusValue } from '~/types/user'

// Auth flows and the session. Response shapes derive from the generated wire types
// (types/wire.ts); request inputs are the console's own (narrower) shapes.

export type LoginCredentials = {
  email: string
  password: string
}

export type RegisterInput = {
  email: string
  password: string
  first_name?: string
  last_name?: string
}

export type MagicLinkRequestInput = {
  email: string
  redirect_url?: string | null
}

export type MagicLinkVerifyInput = {
  token: string
}

export type AccessCodeChannel = 'email' | 'whatsapp' | 'sms'

export type AccessCodeRequestInput = {
  email?: string
  phone?: string
  channel?: AccessCodeChannel
  redirect_url?: string | null
}

export type AccessCodeVerifyInput = {
  email?: string
  phone?: string
  channel?: AccessCodeChannel
  code: string
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

// Tokens as every sign-in path hands them to finalizeAuth: the pair is required; the rest of the
// login response (expiry, type, next_url) is optional because the OAuth callback carries the pair
// in the URL fragment only.
export type AuthTokens = RequestBody<Schemas['LoginResponse'], 'access_token' | 'refresh_token'>

// A passwordless verification's outcome: the signed-in user and where to go next (next_url: the
// canonical post-sign-in destination the backend validated against the frontend profile).
export type PasswordlessSignIn = {
  user: SessionUser
  nextUrl: string | null
}

// The signed-in identity (GET /users/me): the user response with the statuses the console handles.
export type SessionUser = Narrow<ResponseBody<Schemas['UserResponse']>, { status: UserStatusValue }>

// Capability discovery — the UI adapts to what the mounted deployment exposes (A1). Kept by hand
// on purpose: it must also read older library versions (optional keys, available_permissions),
// while the snapshot's AuthConfigResponse types `features` as an open object.
export type AuthConfig = {
  preset: string
  library_version?: string
  api_contract_version?: string
  mounted_surfaces?: string[]
  features: {
    entity_hierarchy: boolean
    context_aware_roles: boolean
    abac: boolean
    tree_permissions: boolean
    api_keys: boolean
    system_api_keys?: boolean
    user_status: boolean
    activity_tracking: boolean
    invitations: boolean
    magic_links?: boolean
    access_codes?: boolean
  }
  auth_methods?: {
    password: boolean
    magic_link?: boolean
    access_code?: boolean
  }
  // Digits in a one-time code, when the library version advertises it (not yet in 0.1.0a34).
  access_code_length?: number
}

// Every paginated list endpoint answers with this envelope (PaginatedResponse_<Item>_ in the
// OpenAPI schema); only the item type varies.
export type PaginatedResponse<T> = Narrow<Schemas['PaginatedResponse_UserResponse_'], { items: T[] }>
