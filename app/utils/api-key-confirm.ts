import type { ConfirmCopy } from '~/composables/useConfirmAction'
import type { DiscardPrompt } from '~/composables/useDialogGuard'

// Confirmation copy shared by personal API keys and service-account (machine) keys, stated in
// the backend's terms: rotate issues a new key with the same settings and revokes the old one at
// once; revoke keeps the key as revoked, never usable again; suspend is reversible.

/**
 * What rotating this key does. The backend copies the name, description, scopes, IP allowlist
 * and rate limits, but not the expiry instant: the new key expires the remaining time from now,
 * rounded up to whole days. The console offers Rotate only on an active key that is in effect
 * and not past its expiry (apiKeyActionStates, F-080), so this copy covers that case alone.
 */
export function apiKeyRotateEffects(key: { expires_at?: string | null }): string[] {
  return [
    'The current key stops working immediately. Update everything that uses it.',
    'A new key with the same name, description, scopes, IP allowlist and rate limits is issued and shown once.',
    key.expires_at
      ? 'The new key expires about when the current one does: the time left is rounded up to whole days, so it can end up to a day later.'
      : 'Like the current key, the new key never expires.'
  ]
}

export const API_KEY_REVOKE_EFFECTS = [
  'Requests signed with this key are refused immediately.',
  'The key stays listed as revoked for the audit trail. It can\'t be reactivated or rotated.'
]

/** Suspend (reversible) or reactivate a key. */
export function apiKeyStatusCopy(name: string, action: 'suspend' | 'reactivate', noun = 'API key'): ConfirmCopy {
  return action === 'suspend'
    ? {
        title: `Suspend ${noun} ${name}`,
        effects: [
          'Requests signed with this key are refused until it is reactivated.',
          'Nothing else about the key changes; reactivating it restores access.'
        ],
        confirmLabel: 'Suspend key',
        confirmColor: 'warning'
      }
    : {
        title: `Reactivate ${noun} ${name}`,
        description: 'Requests signed with this key are accepted again, within its scopes.',
        confirmLabel: 'Reactivate key',
        confirmColor: 'primary'
      }
}

/** The prompt before closing a one-time secret that may not have been stored yet. */
export const SECRET_NOT_STORED: DiscardPrompt = {
  title: 'Close without storing the key?',
  description: 'The full key is shown only once. After this dialog closes it can\'t be shown again; rotating the key is the only way to get a new secret.',
  confirmLabel: 'Close without storing',
  cancelLabel: 'Keep it open'
}
