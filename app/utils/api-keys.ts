import type { DropdownMenuItem } from '@nuxt/ui'
import type { ApiKey } from '~/types/api-key'
import type { BadgeColor } from '~/utils/status'

// API keys, whoever owns them (personal keys, service-account keys, the entity key inventory):
// the pure rules behind every key table and the key detail. No Vue or Nuxt imports: unit-tested
// in test/unit/api-keys.test.ts.
//
// A key's stored status is only half the answer. outlabs-auth also reports whether the key works
// right now (is_currently_effective) and why not (ineffective_reasons): its expiry date passed
// (the server never writes status 'expired'), its owner or service account cannot authenticate,
// the entity it is restricted to is gone or inactive, or none of its scopes is still granted.
// The console shows what the key can do, not only what was stored (F-027).

type KeyFields = Pick<ApiKey, 'status'> & Partial<Pick<ApiKey, 'expires_at' | 'is_currently_effective' | 'ineffective_reasons'>>

// ── Effectiveness ──

/** Each ineffective_reasons code as a sentence. Unknown codes fall back to their words. */
export const INEFFECTIVE_REASON_COPY: Record<string, string> = {
  key_suspended: 'The key is suspended.',
  key_revoked: 'The key is revoked.',
  key_expired: 'Its expiry date has passed.',
  owner_missing: 'The account that owns it no longer exists.',
  owner_inactive: 'The account that owns it cannot sign in (for example suspended, locked or deleted).',
  integration_principal_missing: 'Its service account no longer exists.',
  integration_principal_inactive: 'Its service account is deactivated or archived.',
  anchor_missing: 'The entity it is restricted to no longer exists.',
  anchor_inactive: 'The entity it is restricted to is inactive or archived.',
  policy_invalid: 'Its settings no longer pass the server\'s key policy.',
  no_effective_scopes: 'None of its scopes is still granted to its owner, so it can do nothing.'
}

export function ineffectiveReasonText(code: string): string {
  const known = INEFFECTIVE_REASON_COPY[code]
  if (known) return known
  const words = code.replace(/[_.-]+/g, ' ').trim()
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}.`
}

/** Whether the key's expiry date has passed (the server keeps such keys 'active'). */
export function isPastExpiry(key: Partial<Pick<ApiKey, 'expires_at'>>, now: number = Date.now()): boolean {
  if (!key.expires_at) return false
  const at = Date.parse(key.expires_at)
  return Number.isFinite(at) && at <= now
}

export type ApiKeyStateKind = 'active' | 'ineffective' | 'suspended' | 'expired' | 'revoked'

export type ApiKeyState = {
  kind: ApiKeyStateKind
  label: string
  color: BadgeColor
  /**
   * Why the key is refused beyond what the label says, as sentences: empty for a working, a
   * revoked or a merely suspended key.
   */
  reasons: string[]
}

const STATUS_REASON_CODES = new Set(['key_suspended', 'key_revoked', 'key_expired'])

/**
 * What a key's badge says:
 * - Revoked (error) and Expired (neutral, by status or because its expiry date passed) are final;
 * - Suspended (warning) until it is reactivated;
 * - Not in effect (warning): stored active, but the server refuses it, with the reasons;
 * - Active (success) otherwise. A server without the key policy service sends no effectiveness:
 *   the stored status stands.
 */
export function apiKeyState(key: KeyFields, now: number = Date.now()): ApiKeyState {
  const others = (key.ineffective_reasons ?? []).filter(code => !STATUS_REASON_CODES.has(code)).map(ineffectiveReasonText)
  if (key.status === 'revoked') return { kind: 'revoked', label: 'Revoked', color: 'error', reasons: [] }
  if (key.status === 'expired' || isPastExpiry(key, now)) {
    return { kind: 'expired', label: 'Expired', color: 'neutral', reasons: [INEFFECTIVE_REASON_COPY.key_expired!] }
  }
  if (key.status === 'suspended') {
    // The badge says it is suspended; the reasons list only what else would keep it refused.
    return { kind: 'suspended', label: 'Suspended', color: 'warning', reasons: others }
  }
  if (key.is_currently_effective === false) {
    return { kind: 'ineffective', label: 'Not in effect', color: 'warning', reasons: others.length ? others : ['The server refuses it right now.'] }
  }
  return { kind: 'active', label: 'Active', color: 'success', reasons: [] }
}

/** Revoked and expired keys (by status or date): kept for the audit trail, never usable again. */
export function isTerminalKey(key: KeyFields, now: number = Date.now()): boolean {
  const kind = apiKeyState(key, now).kind
  return kind === 'revoked' || kind === 'expired'
}

/** The rows a key table shows: live keys by default, every key with "Include revoked and expired". */
export function visibleKeys<T extends KeyFields>(keys: readonly T[], includeTerminal: boolean, now: number = Date.now()): T[] {
  return includeTerminal ? [...keys] : keys.filter(key => !isTerminalKey(key, now))
}

/**
 * The empty state of a key table that hides revoked and expired keys by default. The table is
 * empty with nothing hidden only when there is no key at all ("No keys yet"); otherwise every
 * key is revoked or expired ("No active keys", saying how many are hidden).
 */
export function keyListEmptyCopy(opts: { hiddenTerminal: number, noneYet: string }): { title: string, description: string } {
  if (!opts.hiddenTerminal) return { title: 'No keys yet', description: opts.noneYet }
  const n = opts.hiddenTerminal
  return {
    title: 'No active keys',
    description: `${n} revoked or expired key${n === 1 ? ' is' : 's are'} hidden. Include revoked and expired to see ${n === 1 ? 'it' : 'them'}.`
  }
}

// ── Entity key inventory (server-filtered) ──
// The inventory route filters on the STORED status only: outlabs-auth has no filter on whether a
// key works, and it never writes 'expired' (a key past its expiry date stays 'active'). So the
// inventory offers no Expired choice (it would always be empty), and the default choice says it
// includes keys past their expiry; each row's badge shows the effective state. Splitting the
// server's page on the client would break the total and the pages, so it is not done
// (PRODUCTION.md section 8 records the backend follow-up).

export const KEY_INVENTORY_STATUSES = ['active', 'suspended', 'revoked', 'all'] as const satisfies readonly (ApiKey['status'] | 'all')[]
export type KeyInventoryStatus = (typeof KEY_INVENTORY_STATUSES)[number]
export const KEY_INVENTORY_STATUS_ITEMS: { label: string, value: KeyInventoryStatus }[] = [
  { label: 'Active (includes expired)', value: 'active' },
  { label: 'Suspended', value: 'suspended' },
  { label: 'Revoked', value: 'revoked' },
  { label: 'All statuses', value: 'all' }
]

/**
 * The inventory's empty state. Filtered: "No keys match", with Clear filters and, unless every
 * status is already shown, Show all statuses. Unfiltered (the default active view): "No active
 * keys here", with Show all statuses for the suspended and revoked ones.
 */
export function keyInventoryEmptyCopy(opts: { filtered: boolean, status: KeyInventoryStatus }): {
  title: string
  description: string
  clearFilters: boolean
  showAllStatuses: boolean
} {
  if (opts.filtered) {
    return {
      title: 'No keys match',
      description: opts.status === 'all' ? 'Try a different search or clear the filters.' : 'Try a different search, show every status or clear the filters.',
      clearFilters: true,
      showAllStatuses: opts.status !== 'all'
    }
  }
  return {
    title: 'No active keys here',
    description: 'No active key is anchored at this entity. Show all statuses to see its suspended and revoked keys.',
    clearFilters: false,
    showAllStatuses: true
  }
}

const DAY_MS = 86_400_000
export const EXPIRY_SOON_DAYS = 7

/** A live key that expires within a week (the Expires column flags it). */
export function expiresSoon(key: KeyFields, now: number = Date.now()): boolean {
  if (!key.expires_at || isTerminalKey(key, now)) return false
  const at = Date.parse(key.expires_at)
  return Number.isFinite(at) && at - now <= EXPIRY_SOON_DAYS * DAY_MS
}

// ── Actions ──

export type ApiKeyAction = 'edit' | 'rotate' | 'suspend' | 'reactivate' | 'revoke' | 'replace'

export type ApiKeyActionState = {
  action: ApiKeyAction
  /** Set when the action is shown but unavailable: why (shown with the disabled item). */
  disabledReason: string | null
}

export const ROTATE_SUSPENDED_REASON = 'Reactivate the key first: rotating it would issue an active key.'
export const ROTATE_INEFFECTIVE_REASON = 'The key is not in effect, so a rotated key would not work either. Resolve why first.'

/**
 * A key's actions, in menu order (F-080, F-082, F-184):
 * - revoked keys offer nothing (hide the menu); expired keys (by status or date) only "Create
 *   replacement" where the caller can mint one (`canReplace`): a rotation would drop the expiry;
 * - Edit, Rotate, Suspend and Reactivate need api_key:update (`canUpdate`), Revoke api_key:delete
 *   (`canDelete`);
 * - Rotate only on an active key that is in effect: on a suspended key it is shown disabled with
 *   the reason (rotating would lift the suspension), and on a key the server refuses too.
 */
export function apiKeyActionStates(
  key: KeyFields,
  grants: { canUpdate: boolean, canDelete: boolean, canReplace?: boolean },
  now: number = Date.now()
): ApiKeyActionState[] {
  const state = apiKeyState(key, now)
  if (state.kind === 'revoked') return []
  if (state.kind === 'expired') return grants.canReplace ? [{ action: 'replace', disabledReason: null }] : []
  const actions: ApiKeyActionState[] = []
  if (grants.canUpdate) {
    actions.push({ action: 'edit', disabledReason: null })
    if (state.kind === 'suspended') {
      actions.push({ action: 'rotate', disabledReason: ROTATE_SUSPENDED_REASON })
      actions.push({ action: 'reactivate', disabledReason: null })
    } else {
      actions.push({ action: 'rotate', disabledReason: state.kind === 'ineffective' ? ROTATE_INEFFECTIVE_REASON : null })
      actions.push({ action: 'suspend', disabledReason: null })
    }
  }
  if (grants.canDelete) actions.push({ action: 'revoke', disabledReason: null })
  return actions
}

export const API_KEY_ACTION_LABELS: Record<ApiKeyAction, { label: string, icon: string, color?: 'error' }> = {
  edit: { label: 'Edit', icon: 'i-lucide-pencil' },
  rotate: { label: 'Rotate', icon: 'i-lucide-refresh-cw' },
  suspend: { label: 'Suspend', icon: 'i-lucide-pause' },
  reactivate: { label: 'Reactivate', icon: 'i-lucide-play' },
  revoke: { label: 'Revoke', icon: 'i-lucide-ban', color: 'error' },
  replace: { label: 'Create replacement', icon: 'i-lucide-copy-plus' }
}

/**
 * Row-menu items for a key: "View details" first when `view` is given, then the actions. A
 * disabled action carries its reason as the item's description. Empty when there is nothing to
 * do (hide the menu).
 */
export function apiKeyMenuItems(
  states: readonly ApiKeyActionState[],
  handlers: Partial<Record<ApiKeyAction, () => void>> & { view?: () => void }
): DropdownMenuItem[] {
  const items: DropdownMenuItem[] = []
  for (const { action, disabledReason } of states) {
    const handler = handlers[action]
    if (!handler) continue
    const { label, icon, color } = API_KEY_ACTION_LABELS[action]
    items.push({
      label,
      icon,
      ...(color ? { color } : {}),
      ...(disabledReason ? { disabled: true, description: disabledReason } : { onSelect: handler })
    })
  }
  if (!items.length) return []
  return handlers.view ? [{ label: 'View details', icon: 'i-lucide-panel-right-open', onSelect: handlers.view }, ...items] : items
}

// ── Display ──

/** Live and test prefixes are a label only: verification ignores them (F-087). */
export const API_KEY_TYPE_ITEMS = [
  { label: 'Live', value: 'sk_live', description: 'The key starts with sk_live_.' },
  { label: 'Test', value: 'sk_test', description: 'The key starts with sk_test_.' }
]
export const API_KEY_TYPE_HELP = 'A label only: test and live keys have the same access. Limit a key with scopes, an expiry and an IP allowlist.'

export function apiKeyTypeLabel(prefix: string | null | undefined): string {
  return prefix?.startsWith('sk_test') ? 'Test' : 'Live'
}

export function rateLimitLabel(perMinute: number | null | undefined): string {
  return perMinute && perMinute > 0 ? `${perMinute} requests per minute` : 'No limit'
}

/** New-key expiry choices (days, or never). */
export const EXPIRY_CHOICES = ['7', '30', '90', '180', '365', 'never'] as const
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]
export const EXPIRY_ITEMS: { label: string, value: ExpiryChoice }[] = [
  { label: '7 days', value: '7' },
  { label: '30 days', value: '30' },
  { label: '90 days', value: '90' },
  { label: '180 days', value: '180' },
  { label: '1 year', value: '365' },
  { label: 'Never', value: 'never' }
]
export const DEFAULT_EXPIRY: ExpiryChoice = '90'

export function expiryDays(choice: ExpiryChoice): number | undefined {
  return choice === 'never' ? undefined : Number(choice)
}

/**
 * The expiry a replacement starts with: the choice closest to the old key's lifetime (from its
 * creation to its expiry), so a 30-day key is replaced by a 30-day key; 90 days when unknown.
 */
export function replacementExpiry(key: Partial<Pick<ApiKey, 'created_at' | 'expires_at'>>): ExpiryChoice {
  const created = key.created_at ? Date.parse(key.created_at) : Number.NaN
  const expires = key.expires_at ? Date.parse(key.expires_at) : Number.NaN
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= created) return DEFAULT_EXPIRY
  const days = (expires - created) / DAY_MS
  const choices = EXPIRY_CHOICES.filter(c => c !== 'never').map(Number)
  const closest = choices.reduce((best, c) => (Math.abs(c - days) < Math.abs(best - days) ? c : best), choices[0]!)
  return String(closest) as ExpiryChoice
}

/** "3 scopes" */
export function scopeCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'scope' : 'scopes'}`
}
