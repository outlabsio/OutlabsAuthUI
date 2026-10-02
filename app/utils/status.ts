import type { ApiKeyStatus, IntegrationPrincipalStatus } from '~/types/api-key'
import type { MembershipStatusValue } from '~/types/membership'
import type { UserStatusValue } from '~/types/user'

// One colour and one label per enum value, shared by lists, detail lists and cards, so a
// status reads the same everywhere (F-215). Status colours are reserved for status; type and
// origin badges stay neutral.

export type BadgeColor = 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'error' | 'neutral'

export type DefinitionStatus = 'active' | 'inactive' | 'archived'

export const USER_STATUS_COLOR: Record<UserStatusValue, BadgeColor> = {
  active: 'success',
  invited: 'info',
  suspended: 'warning',
  banned: 'error',
  deleted: 'neutral'
}

// Roles, permissions, entities and service accounts share the definition lifecycle.
export const DEFINITION_STATUS_COLOR: Record<DefinitionStatus | IntegrationPrincipalStatus, BadgeColor> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'neutral'
}

export const API_KEY_STATUS_COLOR: Record<ApiKeyStatus, BadgeColor> = {
  active: 'success',
  suspended: 'warning',
  revoked: 'error',
  expired: 'neutral'
}

export const MEMBERSHIP_STATUS_COLOR: Record<MembershipStatusValue | 'revoked' | 'expired' | 'pending', BadgeColor> = {
  active: 'success',
  suspended: 'warning',
  revoked: 'neutral',
  expired: 'neutral',
  pending: 'info'
}

// 'pending_approval' -> 'Pending approval', 'read_tree' stays a code elsewhere; this is for
// enum VALUES shown as words.
export function statusLabel(value: string | null | undefined): string {
  if (!value) return '—'
  const words = value.replace(/[_.-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

export const originLabel = (isSystem: boolean): string => (isSystem ? 'System' : 'Custom')

// A badge's look: bind it with v-bind in a table cell (<UBadge v-bind="ENTITY_CLASS_BADGE[cls]" />)
// or pass it as a DetailItem `badge`, so a list and a detail page render the same badge. A role's
// type badge is roleTypeBadge (utils/role-definitions.ts).
export type BadgeStyle = { color: BadgeColor, label: string, variant: 'subtle' | 'outline' | 'soft' | 'solid' }

// Entity class: structure vs access reads in colour on the tree, lists and the detail; the
// entity TYPE (organization, region, team...) stays a neutral badge.
export const ENTITY_CLASS_BADGE: Record<'structural' | 'access_group', BadgeStyle> = {
  structural: { color: 'info', label: 'Structural', variant: 'subtle' },
  access_group: { color: 'secondary', label: 'Access group', variant: 'subtle' }
}

// Entity type (the organisation's own word: organization, region, team...): one neutral badge,
// the same in the tree, the detail overview and the Children table.
export function entityTypeBadge(entityType: string): BadgeStyle {
  return { color: 'neutral', variant: 'subtle', label: entityType }
}

export const yesNo = (value: boolean | null | undefined): string => (value === null || value === undefined ? '—' : value ? 'Yes' : 'No')

export function badgeColor<T extends string>(map: Record<T, BadgeColor>, value: string | null | undefined): BadgeColor {
  return value && value in map ? map[value as T] : 'neutral'
}
