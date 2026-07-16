import type { AuthConfig } from '@/features/auth/types/auth.types'

export const authFeatureLabels = [
  ['entity_hierarchy', 'Entity hierarchy'],
  ['context_aware_roles', 'Context-aware roles'],
  ['abac', 'ABAC'],
  ['tree_permissions', 'Tree permissions'],
  ['api_keys', 'API keys'],
  ['system_api_keys', 'System API keys'],
  ['user_status', 'User status'],
  ['activity_tracking', 'Activity tracking'],
  ['invitations', 'Invitations'],
  ['magic_links', 'Magic links'],
  ['access_codes', 'Access codes'],
] as const satisfies ReadonlyArray<readonly [keyof AuthConfig['features'], string]>

export const authMethodLabels = [
  ['password', 'Password'],
  ['magic_link', 'Magic link'],
  ['access_code', 'Access code'],
] as const satisfies ReadonlyArray<
  readonly [keyof NonNullable<AuthConfig['auth_methods']>, string]
>

export function listEnabledAuthFeatures(features: AuthConfig['features']) {
  return authFeatureLabels.filter(([key]) => Boolean(features[key]))
}

export function listEnabledAuthMethods(authMethods: AuthConfig['auth_methods']) {
  if (!authMethods) {
    return []
  }

  return authMethodLabels.filter(([key]) => Boolean(authMethods[key]))
}
