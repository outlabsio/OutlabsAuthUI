import type { AuthTokens, LoginCredentials } from '@/features/auth/types/auth.types'
import { apiClient } from '@/lib/api/client'

export function login(credentials: LoginCredentials) {
  return apiClient.post<AuthTokens>('/auth/login', {
    auth: false,
    body: credentials,
  })
}
