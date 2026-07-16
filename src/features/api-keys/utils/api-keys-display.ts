import type { AppStatusTone } from '@/components/app/app-status'
import type {
  ApiKey,
  ApiKeyKind,
  ApiKeyStatus,
  IntegrationPrincipal,
} from '@/features/api-keys/types/api-keys.types'

export type InventoryKeyKindFilter = 'all' | ApiKeyKind
export type ApiKeyStatusFilter = 'all' | ApiKeyStatus
export type EntityOwnerOption = {
  id: string
  label: string
  subtitle: string
}

export function formatDateTime(value?: string | null, fallback = 'Never') {
  if (!value) {
    return fallback
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value))
  } catch {
    return fallback
  }
}

export function formatToken(value: string) {
  return value
    .split(/[_-]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function getApiKeyStatusTone(status: ApiKeyStatus): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'suspended':
      return 'warning'
    case 'expired':
      return 'warning'
    case 'revoked':
      return 'error'
    default:
      return 'neutral'
  }
}

export function getPrincipalStatusTone(status: IntegrationPrincipal['status']): AppStatusTone {
  switch (status) {
    case 'active':
      return 'success'
    case 'inactive':
      return 'warning'
    case 'archived':
      return 'neutral'
    default:
      return 'neutral'
  }
}

export function getEffectivenessTone(apiKey: ApiKey): AppStatusTone {
  if (apiKey.status === 'revoked') {
    return 'error'
  }

  return apiKey.is_currently_effective ? 'success' : 'warning'
}

export function formatOwnerType(ownerType?: ApiKey['owner_type'] | null) {
  if (!ownerType) {
    return 'Unknown owner'
  }

  return formatToken(ownerType)
}

export function describeKeyPermissions(apiKey: ApiKey, principal?: IntegrationPrincipal | null) {
  if (apiKey.scopes.length > 0) {
    return apiKey.scopes
  }

  return principal?.effective_allowed_scopes ?? principal?.allowed_scopes ?? []
}

export function buildOwnerOptions(
  members: Array<{
    user_id: string
    user_email: string
    user_first_name?: string | null
    user_last_name?: string | null
  }>
) {
  const deduped = new Map<string, EntityOwnerOption>()

  for (const member of members) {
    const fullName = [member.user_first_name, member.user_last_name]
      .filter(Boolean)
      .join(' ')
      .trim()

    deduped.set(member.user_id, {
      id: member.user_id,
      label: fullName || member.user_email,
      subtitle: fullName ? member.user_email : 'Entity member',
    })
  }

  return [...deduped.values()].sort((left, right) => left.label.localeCompare(right.label))
}
