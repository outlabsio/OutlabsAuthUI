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

export type RevokeUserSessionInput = {
  userId: string
  sessionId: string
}

export type RevokeAllUserSessionsInput = {
  userId: string
}
