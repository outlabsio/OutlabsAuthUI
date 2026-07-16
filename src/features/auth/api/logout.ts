import { apiClient } from '@/lib/api/client'
import { getStoredRefreshToken } from '@/lib/api/auth-token'

export type LogoutInput = {
  immediate?: boolean
}

export function logout(input: LogoutInput = {}) {
  const refreshToken = getStoredRefreshToken()

  return apiClient.post<void>('/auth/logout', {
    body: {
      ...(refreshToken ? { refresh_token: refreshToken } : {}),
      immediate: input.immediate ?? true,
    },
  })
}
