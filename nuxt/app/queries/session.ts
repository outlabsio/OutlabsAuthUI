import { defineQueryOptions, useMutation, useQueryCache, type QueryCache } from '@pinia/colada'
import { apiClient, withFrontendProfile, withFrontendProfileQuery } from '~/utils/api'
import { clearStoredAuthTokens, getStoredRefreshToken, setStoredAuthTokens } from '~/auth/tokens'
import type {
  AcceptInviteInput,
  AccessCodeRequestInput,
  AccessCodeVerifyInput,
  AuthConfig,
  AuthTokens,
  ForgotPasswordInput,
  LoginCredentials,
  MagicLinkRequestInput,
  MagicLinkVerifyInput,
  ResetPasswordInput,
  SessionUser
} from '~/types/auth'

// Auth = SERVER STATE, owned by Pinia Colada (not a Pinia store). The query cache is the
// single source of truth for "who am I" (`['session']`) and "what does this backend expose"
// (`['auth-config']`). Tokens — the only genuine client state — live in ~/auth/tokens.
// Every token-returning entrypoint funnels through finalizeAuth(); useAuth() is the read
// surface; middleware reads the cache directly via useQueryCache().

export const SESSION_KEY = ['session'] as const
export const AUTH_CONFIG_KEY = ['auth-config'] as const
export const MY_PERMISSIONS_KEY = ['my-permissions'] as const

export const sessionQuery = defineQueryOptions({
  key: SESSION_KEY,
  query: () => apiClient.get<SessionUser>('/users/me'),
  staleTime: 1000 * 60 * 5
})
// The `enabled` gate (only fetch when tokens are present) is applied at the useQuery call in
// useAuth — a reactive getter can't live on static defineQueryOptions.

export const authConfigQuery = defineQueryOptions({
  key: AUTH_CONFIG_KEY,
  // Public capability discovery — the sign-in screen needs auth_methods before any session.
  query: () => apiClient.get<AuthConfig>('/auth/config'),
  staleTime: 1000 * 60 * 30
})

// The current actor's effective permission names (RBAC gating). Superusers bypass this.
export const myPermissionsQuery = defineQueryOptions({
  key: MY_PERMISSIONS_KEY,
  query: () => apiClient.get<string[]>('/permissions/me'),
  staleTime: 1000 * 60 * 5
})

// Shared finalizer: store tokens, then seed the session + config caches so the whole app
// reflects the logged-in identity immediately (no refetch flash).
export async function finalizeAuth(queryCache: QueryCache, tokens: AuthTokens): Promise<SessionUser> {
  setStoredAuthTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
  const [user, config, permissions] = await Promise.all([
    apiClient.get<SessionUser>('/users/me'),
    apiClient.get<AuthConfig>('/auth/config'),
    apiClient.get<string[]>('/permissions/me')
  ])
  queryCache.setQueryData(SESSION_KEY, user)
  queryCache.setQueryData(AUTH_CONFIG_KEY, config)
  queryCache.setQueryData(MY_PERMISSIONS_KEY, permissions)
  return user
}

// Reset local session state (logout + forced expiry).
export function resetSession(queryCache: QueryCache) {
  clearStoredAuthTokens()
  queryCache.setQueryData(SESSION_KEY, null)
  queryCache.setQueryData(MY_PERMISSIONS_KEY, [])
}

// ── Mutations (composables, one per auth flow) ──

export function useLogin() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: async (credentials: LoginCredentials) => {
      const tokens = await apiClient.post<AuthTokens>('/auth/login', {
        auth: false,
        body: withFrontendProfile({ ...credentials })
      })
      return finalizeAuth(queryCache, tokens)
    }
  })
}

export function useLogout() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: async () => {
      const refreshToken = getStoredRefreshToken()
      try {
        await apiClient.post<undefined>('/auth/logout', {
          body: { ...(refreshToken ? { refresh_token: refreshToken } : {}), immediate: true }
        })
      } catch {
        // Best-effort — always clear locally even if the server call fails.
      }
      resetSession(queryCache)
    }
  })
}

export function useRequestMagicLink() {
  return useMutation({
    mutation: (input: MagicLinkRequestInput) =>
      apiClient.post<undefined>('/auth/magic-link/request', { auth: false, body: withFrontendProfile({ ...input }) })
  })
}

export function useVerifyMagicLink() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: async (input: MagicLinkVerifyInput) => {
      const tokens = await apiClient.post<AuthTokens>('/auth/magic-link/verify', { auth: false, body: input })
      return finalizeAuth(queryCache, tokens)
    }
  })
}

export function useRequestAccessCode() {
  return useMutation({
    mutation: (input: AccessCodeRequestInput) =>
      apiClient.post<undefined>('/auth/access-code/request', { auth: false, body: withFrontendProfile({ ...input }) })
  })
}

export function useVerifyAccessCode() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: async (input: AccessCodeVerifyInput) => {
      const tokens = await apiClient.post<AuthTokens>('/auth/access-code/verify', { auth: false, body: input })
      return finalizeAuth(queryCache, tokens)
    }
  })
}

export function useForgotPassword() {
  return useMutation({
    mutation: (input: ForgotPasswordInput) =>
      apiClient.post<undefined>('/auth/forgot-password', { auth: false, body: withFrontendProfile({ ...input }) })
  })
}

export function useResetPassword() {
  return useMutation({
    mutation: (input: ResetPasswordInput) =>
      apiClient.post<undefined>('/auth/reset-password', { auth: false, body: input })
  })
}

export function useAcceptInvite() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: async (input: AcceptInviteInput) => {
      const tokens = await apiClient.post<AuthTokens>('/auth/accept-invite', {
        auth: false,
        body: withFrontendProfile({ ...input })
      })
      return finalizeAuth(queryCache, tokens)
    }
  })
}

export function useStartOAuthLogin() {
  return useMutation({
    mutation: (provider: string) =>
      apiClient.get<{ authorization_url: string }>(withFrontendProfileQuery(`/oauth/${provider}/authorize`), { auth: false })
  })
}
