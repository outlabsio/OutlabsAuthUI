import type { QueryCache } from '@pinia/colada'
import { apiClient } from '~/api/client'
import { AUTH_CONFIG_KEY } from '~/queries/session'
import type { AuthConfig } from '~/types/auth'

// Capability discovery outside a component (route middleware). Returns the cached
// /auth/config, or makes ONE attempt to load it and seeds the cache so every useAuth()
// consumer picks it up. Null means "still unknown" — callers must fail closed.
export async function ensureAuthConfig(queryCache: QueryCache): Promise<AuthConfig | null> {
  const cached = queryCache.getQueryData<AuthConfig>(AUTH_CONFIG_KEY)
  if (cached) return cached
  try {
    const config = await apiClient.get<AuthConfig>('/auth/config')
    queryCache.setQueryData(AUTH_CONFIG_KEY, config)
    return config
  } catch {
    return null
  }
}
