import type { AuthConfig } from '~/types/auth'
import type { AuthFeature, AuthSurface } from '~/utils/capabilities'

// One name (and one sentence) per backend capability, for every screen that lists them
// (Settings' server card and its capability lists), instead of each humanizing raw keys
// ('Abac', 'Api Keys'). Unknown keys from a newer library fall back to a humanized key.

export type CapabilityLabel = { label: string, description: string }

export const FEATURE_LABELS: Record<AuthFeature, CapabilityLabel> = {
  entity_hierarchy: { label: 'Entity hierarchy', description: 'Organizations, entities and memberships.' },
  context_aware_roles: { label: 'Context-aware roles', description: 'Roles whose permissions depend on the entity type.' },
  abac: { label: 'Attribute conditions (ABAC)', description: 'Conditions on roles and permissions.' },
  tree_permissions: { label: 'Tree permissions', description: 'Grants that also cover an entity\'s descendants.' },
  api_keys: { label: 'Personal API keys', description: 'Accounts mint keys that act as themselves.' },
  system_api_keys: { label: 'Service accounts', description: 'Machine identities with their own roles and keys.' },
  user_status: { label: 'Account status', description: 'Suspend, ban and reactivate accounts.' },
  activity_tracking: { label: 'Activity tracking', description: 'Account events are recorded for the audit log.' },
  invitations: { label: 'Invitations', description: 'Invite people by email to set their own password.' },
  magic_links: { label: 'Magic links', description: 'Sign in with a one-time link sent by email.' },
  access_codes: { label: 'Access codes', description: 'Sign in with a one-time code.' }
}

export const SURFACE_LABELS: Record<AuthSurface, string> = {
  auth: 'Sign-in',
  capabilities: 'Capabilities',
  users: 'Users',
  self_service_users: 'Self-service accounts',
  session: 'Sessions',
  roles: 'Roles',
  permissions: 'Permissions',
  entities: 'Entities',
  memberships: 'Memberships',
  api_keys: 'Personal API keys',
  api_key_admin: 'API key administration',
  integration_principals: 'Service accounts',
  audit: 'Audit',
  config: 'Configuration',
  oauth: 'OAuth sign-in',
  oauth_associate: 'OAuth account linking'
}

export const AUTH_METHOD_LABELS: Record<keyof NonNullable<AuthConfig['auth_methods']>, string> = {
  password: 'Password',
  magic_link: 'Magic link',
  access_code: 'Access code'
}

function humanize(key: string): string {
  const text = key.replace(/[_-]+/g, ' ').trim()
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : key
}

export function featureLabel(key: string): CapabilityLabel {
  return FEATURE_LABELS[key as AuthFeature] ?? { label: humanize(key), description: '' }
}

export function surfaceLabel(key: string): string {
  return SURFACE_LABELS[key as AuthSurface] ?? humanize(key)
}

export function authMethodLabel(key: string): string {
  return AUTH_METHOD_LABELS[key as keyof typeof AUTH_METHOD_LABELS] ?? humanize(key)
}

// The features a server reports, labelled, in this file's order (then any unknown ones).
export function featureList(features: Partial<Record<string, boolean>> | null | undefined): { key: string, label: string, description: string, on: boolean }[] {
  if (!features) return []
  const known = Object.keys(FEATURE_LABELS).filter(key => key in features)
  const unknown = Object.keys(features).filter(key => !(key in FEATURE_LABELS)).sort()
  return [...known, ...unknown].map(key => ({ key, ...featureLabel(key), on: Boolean(features[key]) }))
}

// The sign-in methods a server has switched on, labelled.
export function enabledAuthMethods(methods: Partial<Record<string, boolean>> | null | undefined): string[] {
  if (!methods) return []
  return Object.entries(methods).filter(([, on]) => on).map(([key]) => authMethodLabel(key))
}
