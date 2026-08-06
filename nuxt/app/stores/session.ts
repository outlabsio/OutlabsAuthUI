import { defineStore } from 'pinia'
import {
  apiClient,
  authSessionExpiredEvent,
  withFrontendProfile
} from '~/utils/api'
import {
  clearStoredAuthTokens,
  getStoredRefreshToken,
  hasStoredAuthTokens,
  setStoredAuthTokens
} from '~/utils/auth-token'
import type { AuthConfig, AuthTokens, LoginCredentials, SessionUser } from '~/types/auth'

type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated'

// A3 — Pinia client-state store: current identity, capabilities discovered from
// /auth/config, and token lifecycle. Nothing paginated/fetched-as-a-resource lives here
// (that is Pinia Colada's job) — only the cross-cutting auth session.
export const useSessionStore = defineStore('session', () => {
  const user = ref<SessionUser | null>(null)
  const capabilities = ref<AuthConfig | null>(null)
  const status = ref<SessionStatus>('idle')

  const isAuthenticated = computed(() => status.value === 'authenticated' && user.value != null)
  const displayName = computed(() => {
    if (!user.value) return ''
    const full = [user.value.first_name, user.value.last_name].filter(Boolean).join(' ').trim()
    return full || user.value.email
  })

  // Capability flags — the UI hides what the mounted backend does not expose.
  function can(feature: keyof AuthConfig['features']) {
    return Boolean(capabilities.value?.features?.[feature])
  }

  async function loadSession() {
    status.value = 'loading'
    const [me, config] = await Promise.all([
      apiClient.get<SessionUser>('/users/me'),
      apiClient.get<AuthConfig>('/auth/config')
    ])
    user.value = me
    capabilities.value = config
    status.value = 'authenticated'
    return me
  }

  async function login(credentials: LoginCredentials) {
    const tokens = await apiClient.post<AuthTokens>('/auth/login', {
      auth: false,
      body: withFrontendProfile({ ...credentials })
    })
    setStoredAuthTokens({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token })
    await loadSession()
    return tokens
  }

  function clear() {
    user.value = null
    capabilities.value = null
    status.value = 'unauthenticated'
  }

  async function logout() {
    const refreshToken = getStoredRefreshToken()
    try {
      await apiClient.post<undefined>('/auth/logout', {
        body: { ...(refreshToken ? { refresh_token: refreshToken } : {}), immediate: true }
      })
    } catch {
      // Best-effort — always clear locally even if the server call fails.
    }
    clearStoredAuthTokens()
    clear()
  }

  // Boot hydration — if tokens are present, resolve the session; otherwise mark
  // unauthenticated. Never throws: a stale token just drops us to the login screen.
  async function restore() {
    if (!hasStoredAuthTokens()) {
      status.value = 'unauthenticated'
      return
    }
    try {
      await loadSession()
    } catch {
      clearStoredAuthTokens()
      clear()
    }
  }

  // The api client dispatches this when a refresh fails mid-flight.
  function bindExpiryListener() {
    if (typeof window === 'undefined') return
    window.addEventListener(authSessionExpiredEvent, () => {
      clear()
    })
  }

  return {
    user,
    capabilities,
    status,
    isAuthenticated,
    displayName,
    can,
    loadSession,
    login,
    logout,
    restore,
    clear,
    bindExpiryListener
  }
})
