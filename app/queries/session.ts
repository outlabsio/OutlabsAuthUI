import { defineQueryOptions, useMutation, useQueryCache, type QueryCache } from '@pinia/colada'
import {
  ApiError,
  apiClient,
  isTransientApiError,
  revokeServerSession,
  withFrontendProfile,
  withFrontendProfileQuery
} from '~/api/client'
import { withRefreshLock } from '~/auth/refresh-lock'
import { clearStoredAuthTokens, hasStoredAuthTokens, readStoredAuthTokens, setStoredAuthTokens } from '~/auth/tokens'
import { myPermissionsPath } from '~/utils/session-lifecycle'
import { IDENTITY_STALE_TIME } from '~/queries/freshness'
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
  PasswordlessSignIn,
  RegisterInput,
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

export function fetchSessionUser() {
  return apiClient.get<SessionUser>('/users/me')
}

export const sessionQuery = defineQueryOptions({
  key: SESSION_KEY,
  query: () => fetchSessionUser(),
  staleTime: IDENTITY_STALE_TIME
})
// The `enabled` gate (only fetch when tokens are present) is applied at the useQuery call in
// useAuth — a reactive getter can't live on static defineQueryOptions.

export const authConfigQuery = defineQueryOptions({
  key: AUTH_CONFIG_KEY,
  // Public capability discovery — the sign-in screen needs auth_methods before any session.
  query: () => apiClient.get<AuthConfig>('/auth/config', { auth: false }),
  staleTime: 1000 * 60 * 30
})

/**
 * The current actor's effective permission names. Read from the permissions router when the
 * backend mounts it, else from the minimal self-service users router, else empty (a host
 * without either still gets a working session; superusers bypass permission checks anyway).
 */
export async function fetchMyPermissions(config: AuthConfig | null | undefined): Promise<string[]> {
  const path = myPermissionsPath(config?.mounted_surfaces)
  if (!path) return []
  try {
    return await apiClient.get<string[]>(path)
  } catch (error) {
    // A backend that predates `mounted_surfaces` and lacks the permissions router.
    if (!config?.mounted_surfaces && error instanceof ApiError && error.status === 404) {
      return apiClient.get<string[]>('/users/me/permissions').catch(() => [])
    }
    throw error
  }
}

export const myPermissionsQuery = defineQueryOptions({
  key: MY_PERMISSIONS_KEY,
  query: () => fetchMyPermissions(useQueryCache().getQueryData<AuthConfig>(AUTH_CONFIG_KEY)),
  staleTime: IDENTITY_STALE_TIME
})

/**
 * Drops every cached server response except the public capability discovery, so nothing the
 * previous actor could see survives a sign-out, a forced expiry or an identity change. Entries
 * are emptied in place (not removed) so components still bound to them render nothing, and a
 * later query for the same key starts from a clean, stale entry.
 */
export function clearSessionCache(queryCache: QueryCache) {
  const configKey = JSON.stringify(AUTH_CONFIG_KEY)
  for (const entry of queryCache.getEntries()) {
    if (JSON.stringify(entry.key) === configKey) continue
    queryCache.cancel(entry)
    queryCache.setEntryState(entry, { status: 'pending', data: undefined, error: null })
    queryCache.invalidate(entry)
  }
  queryCache.setQueryData(SESSION_KEY, null)
}

// Seeds the actor's permissions; a failure is non-fatal (the permissions query retries).
async function seedMyPermissions(queryCache: QueryCache, config: AuthConfig | null | undefined) {
  try {
    queryCache.setQueryData(MY_PERMISSIONS_KEY, await fetchMyPermissions(config))
  } catch {
    // Keep the session; gating falls back to "no permissions" until the query succeeds.
  }
}

/**
 * Verifies minted tokens with /users/me and only then stores them, so a failed sign-in never
 * leaves a usable session in storage; the previous actor's cache is dropped and the new identity
 * seeded. `keepCacheOf` names the account this tab is signed in as when it signs in again: when
 * the minted session belongs to that same account, its cached responses stay (they are that
 * account's) and only the tokens change. Only requests that never renew a session (an explicit
 * bearer) run here, so it is safe under the refresh lock.
 */
async function storeVerifiedSession(
  queryCache: QueryCache,
  tokens: AuthTokens,
  { keepCacheOf = null }: { keepCacheOf?: string | null } = {}
): Promise<SessionUser> {
  const minted = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token }
  let user: SessionUser
  try {
    user = await apiClient.get<SessionUser>('/users/me', { accessToken: minted.accessToken })
  } catch (error) {
    // Do not leave the minted session alive server-side when it could not be used.
    if (!isTransientApiError(error)) void revokeServerSession(minted)
    throw error
  }

  if (keepCacheOf == null || user.id !== keepCacheOf) clearSessionCache(queryCache)
  setStoredAuthTokens(minted)
  queryCache.setQueryData(SESSION_KEY, user)
  return user
}

// The identity entries a sign-in seeds itself (seedSessionDetails); everything else is refetched.
const SEEDED_KEYS = new Set([SESSION_KEY, AUTH_CONFIG_KEY, MY_PERMISSIONS_KEY].map(key => JSON.stringify(key)))

// Capability discovery and permissions for a session just stored; both are non-fatal.
async function seedSessionDetails(queryCache: QueryCache) {
  const config = await apiClient.get<AuthConfig>('/auth/config', { auth: false }).catch(() => null)
  if (config) queryCache.setQueryData(AUTH_CONFIG_KEY, config)
  await seedMyPermissions(queryCache, config ?? queryCache.getQueryData<AuthConfig>(AUTH_CONFIG_KEY))
}

/**
 * Shared finalizer for every token-returning sign-in: verify and store the tokens, then seed
 * capabilities and permissions.
 */
export async function finalizeAuth(queryCache: QueryCache, tokens: AuthTokens): Promise<SessionUser> {
  const user = await storeVerifiedSession(queryCache, tokens)
  await seedSessionDetails(queryCache)
  return user
}

/**
 * Revokes a token pair this console will not use (an OAuth callback this tab never started),
 * without storing it or touching the current session. Best effort: never throws.
 */
export function discardUnusedSession(tokens: AuthTokens): Promise<void> {
  return revokeServerSession({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
}

export type SessionResolution
  = | { status: 'signed-in' }
    | { status: 'signed-out' }
    | { status: 'unreachable', error: ApiError }

/**
 * Resolves the stored session into the cache (boot, retry, and a sign-in in another tab).
 * Tokens are cleared only when the API refuses them after a renewal attempt; an API that does
 * not answer (network, timeout, 5xx, 429) keeps them and reports `unreachable`.
 */
export async function resolveSession(
  queryCache: QueryCache,
  configTask: Promise<AuthConfig | null> = Promise.resolve(queryCache.getQueryData<AuthConfig>(AUTH_CONFIG_KEY) ?? null),
  newerSignInChecked = false
): Promise<SessionResolution> {
  if (!hasStoredAuthTokens()) {
    queryCache.setQueryData(SESSION_KEY, null)
    return { status: 'signed-out' }
  }

  const [userResult, config] = await Promise.all([
    fetchSessionUser().then(
      user => ({ ok: true as const, user }),
      (error: unknown) => ({ ok: false as const, error })
    ),
    configTask
  ])

  if (!userResult.ok) {
    const { error } = userResult
    if (isTransientApiError(error)) return { status: 'unreachable', error }
    if (error instanceof ApiError && error.kind === 'session_ended') {
      // The client already ended the session it presented (and recorded why). Tokens still in
      // storage belong to a newer sign-in made meanwhile in another tab: resolve those once
      // instead of wiping them.
      if (hasStoredAuthTokens() && !newerSignInChecked) return resolveSession(queryCache, configTask, true)
      queryCache.setQueryData(SESSION_KEY, null)
      return { status: 'signed-out' }
    }
    if (error instanceof ApiError && error.status === 401) {
      // Refused with a domain answer (e.g. an inactive account): these tokens cannot be used.
      if (hasStoredAuthTokens()) clearStoredAuthTokens()
      queryCache.setQueryData(SESSION_KEY, null)
      return { status: 'signed-out' }
    }
    // Any other answer (e.g. 404 from a host without /users/me) does not prove the tokens
    // are bad: keep them and let the operator retry.
    return {
      status: 'unreachable',
      error: error instanceof ApiError ? error : new ApiError({ kind: 'network', status: 0, statusText: '', data: null, message: 'The session could not be loaded.' })
    }
  }

  queryCache.setQueryData(SESSION_KEY, userResult.user)
  await seedMyPermissions(queryCache, config)
  return { status: 'signed-in' }
}

// Loads public capability discovery into the cache; resolves null when it cannot be loaded.
export function loadAuthConfig(queryCache: QueryCache): Promise<AuthConfig | null> {
  return apiClient.get<AuthConfig>('/auth/config', { auth: false }).then(
    (config) => {
      queryCache.setQueryData(AUTH_CONFIG_KEY, config)
      return config
    },
    () => null
  )
}

// ── Mutations (composables, one per auth flow) ──

/** A password sign-in, finalized like every other. */
export async function signInWithPassword(queryCache: QueryCache, credentials: LoginCredentials): Promise<SessionUser> {
  const tokens = await apiClient.post<AuthTokens>('/auth/login', {
    auth: false,
    body: withFrontendProfile({ ...credentials })
  })
  return finalizeAuth(queryCache, tokens)
}

/**
 * Signs this tab in again after the server ended its session (a password change, F-029). Runs
 * under the cross-tab refresh lock until the new tokens are stored: a renewal started meanwhile
 * (a background query refused with the old access token, here or in another tab) waits instead
 * of presenting the refresh token the server just revoked, which would end the session while
 * this sign-in is in flight; once the lock is released it finds the new tokens and replays with
 * them. A session that ended before the lock was taken is not resumed.
 *
 * The page stays mounted, so the account's cached responses are kept (the same account signs
 * in again) and every query on screen is refetched with the new session: Account › Security
 * then lists the sessions the change left, instead of waiting for a remount or a focus.
 */
export async function signInAgainWithPassword(queryCache: QueryCache, credentials: LoginCredentials): Promise<SessionUser> {
  const signedInAs = queryCache.getQueryData<SessionUser | null>(SESSION_KEY)?.id ?? null
  const user = await withRefreshLock(async () => {
    if (!hasStoredAuthTokens()) {
      throw new ApiError({ kind: 'session_ended', status: 401, statusText: 'Unauthorized', data: null, source: 'client', message: 'Your session has ended. Sign in again to continue.' })
    }
    const tokens = await apiClient.post<AuthTokens>('/auth/login', {
      auth: false,
      body: withFrontendProfile({ ...credentials })
    })
    return storeVerifiedSession(queryCache, tokens, { keepCacheOf: signedInAs })
  })
  await seedSessionDetails(queryCache)
  queryCache.invalidateQueries({ predicate: entry => !SEEDED_KEYS.has(JSON.stringify(entry.key)) }).catch(() => {})
  return user
}

export function useLogin() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (credentials: LoginCredentials) => signInWithPassword(queryCache, credentials)
  })
}

// Self-service registration (F3) — returns the created user, NOT tokens; the signup form
// follows with a normal login to finalize the session. RegisterRequest has no `app` field
// (outlabs-auth 0.1.0a34), so the frontend profile key rides on that login instead (F-237).
export function useRegister() {
  return useMutation({
    mutation: (input: RegisterInput) =>
      apiClient.post<SessionUser>('/auth/register', { auth: false, body: { ...input } })
  })
}

/**
 * Sign-out. Local state goes first — tokens (other tabs follow through the storage event) and
 * every cached response — so the console never hangs on a slow or unreachable API. The
 * server-side revocation then runs in the background from the captured tokens.
 */
export function useLogout() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: async () => {
      const tokens = readStoredAuthTokens()
      clearStoredAuthTokens('signed_out')
      clearSessionCache(queryCache)
      if (tokens) void revokeServerSession(tokens)
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
    mutation: async (input: MagicLinkVerifyInput): Promise<PasswordlessSignIn> => {
      const tokens = await apiClient.post<AuthTokens>('/auth/magic-link/verify', { auth: false, body: input })
      return { user: await finalizeAuth(queryCache, tokens), nextUrl: tokens.next_url ?? null }
    }
  })
}

export function useRequestAccessCode() {
  return useMutation({
    mutation: (input: AccessCodeRequestInput) =>
      apiClient.post<undefined>('/auth/access-code/request', { auth: false, body: withFrontendProfile({ ...input }) })
  })
}

// The request binds the code to the frontend profile; the verify body has no `app` field in
// the library's contract (0.1.0a34), so none is sent here.
export function useVerifyAccessCode() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: async (input: AccessCodeVerifyInput): Promise<PasswordlessSignIn> => {
      const tokens = await apiClient.post<AuthTokens>('/auth/access-code/verify', { auth: false, body: input })
      return { user: await finalizeAuth(queryCache, tokens), nextUrl: tokens.next_url ?? null }
    }
  })
}

export function useForgotPassword() {
  return useMutation({
    mutation: (input: ForgotPasswordInput) =>
      apiClient.post<undefined>('/auth/forgot-password', { auth: false, body: withFrontendProfile({ ...input }) })
  })
}

/**
 * Reset a password with an emailed token. The server ends every session of that account, so a
 * browser that is signed in (phone recovery emails the link to a signed-in user) signs out here
 * as well: locally first, then the server-side revocation in the background, in case the
 * session belongs to a different account than the token. The sign-in page then asks for the new
 * password instead of bouncing back into a session the server already ended (F-029).
 */
export function useResetPassword() {
  const queryCache = useQueryCache()
  return useMutation({
    mutation: (input: ResetPasswordInput) =>
      apiClient.post<undefined>('/auth/reset-password', { auth: false, body: input }),
    onSuccess: () => {
      const tokens = readStoredAuthTokens()
      if (!tokens) return
      clearStoredAuthTokens('password_changed')
      clearSessionCache(queryCache)
      void revokeServerSession(tokens)
    }
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
