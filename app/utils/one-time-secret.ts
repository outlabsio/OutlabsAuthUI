import type { CreateApiKeyResponse, OneTimeSecret } from '~/types/api-key'

// The AppSecretReveal payload for an API-key create or rotate response.
export function oneTimeSecretFrom(key: CreateApiKeyResponse, owner?: string | null): OneTimeSecret {
  return { secret: key.api_key, name: key.name, prefix: key.prefix, expiresAt: key.expires_at ?? null, owner: owner ?? null }
}
