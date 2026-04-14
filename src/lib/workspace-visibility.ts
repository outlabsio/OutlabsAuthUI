import type { AuthConfig } from '@/features/auth/types/auth.types'

export type WorkspaceKey =
  | 'account'
  | 'apiKeys'
  | 'dashboard'
  | 'entities'
  | 'permissions'
  | 'roles'
  | 'settings'
  | 'systemApiKeys'
  | 'users'

export function isWorkspaceVisible(
  workspace: WorkspaceKey,
  features?: AuthConfig['features']
) {
  if (!features) {
    switch (workspace) {
      case 'apiKeys':
      case 'systemApiKeys':
      case 'entities':
      case 'settings':
        return false
      default:
        return true
    }
  }

  switch (workspace) {
    case 'apiKeys':
      return features.api_keys
    case 'systemApiKeys':
      return features.api_keys && features.entity_hierarchy
    case 'entities':
    case 'settings':
      return features.entity_hierarchy
    default:
      return true
  }
}
