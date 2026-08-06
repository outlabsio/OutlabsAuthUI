// Ported from the React account feature (src/features/account/types + users/user-session).

export type UserSession = {
  id: string
  device_name?: string | null
  ip_address?: string | null
  user_agent?: string | null
  created_at: string
  last_used_at?: string | null
  expires_at: string
  usage_count: number
}

export type UpdateCurrentUserInput = {
  email?: string
  first_name?: string
  last_name?: string
  phone?: string | null
}

export type ChangeCurrentUserPasswordInput = {
  current_password: string
  new_password: string
}
