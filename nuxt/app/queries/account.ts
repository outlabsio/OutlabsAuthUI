import { defineQueryOptions, useMutation, useQueryCache } from '@pinia/colada'
import { apiClient } from '~/api/client'
import type { SessionUser } from '~/types/auth'
import type {
  ChangeCurrentUserPasswordInput,
  UpdateCurrentUserInput,
  UserSession
} from '~/types/account'

// P2 account vertical — the current actor's own profile, password, and sessions.

const SESSIONS_ROOT = 'my-sessions' as const

export const mySessionsQuery = defineQueryOptions({
  key: [SESSIONS_ROOT],
  query: ctx => apiClient.get<UserSession[]>('/users/me/sessions', { signal: ctx?.signal })
})

export function useUpdateProfile() {
  return useMutation({
    mutation: (input: UpdateCurrentUserInput) => apiClient.patch<SessionUser>('/users/me', { body: input })
  })
}

export function useChangePassword() {
  return useMutation({
    mutation: (input: ChangeCurrentUserPasswordInput) =>
      apiClient.post<undefined>('/users/me/change-password', { body: input })
  })
}

export function useRevokeSession() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (sessionId: string) => apiClient.delete<undefined>(`/users/me/sessions/${sessionId}`),
    onSettled: () => queryCache.invalidateQueries({ key: [SESSIONS_ROOT] })
  })
}

export function useRevokeAllSessions() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: () => apiClient.delete<undefined>('/users/me/sessions'),
    onSettled: () => queryCache.invalidateQueries({ key: [SESSIONS_ROOT] })
  })
}
