// Audit payload redaction (F-188). outlabs-auth writes audit snapshots from allowlists, so a
// payload should never carry a credential; the console still refuses to turn an unexpected
// credential-like field into a disclosure. The rule is by exact field name or suffix, not by
// substring: `api_key_id`, `api_key_prefix`, `revoked_refresh_tokens_count`,
// `last_password_change`, `password_reset_expires` and `refresh_token_stored` identify the action
// and stay readable, while `password`, `client_secret`, `refresh_token` and `key_hash` do not.
// Used by every audit view (cards, the Audit table, its changes table, raw JSON and the export).

export const REDACTED = '[REDACTED]'

// Field names whose value is a secret, compared after normalising (lower snake_case).
const SECRET_NAMES = new Set([
  'password',
  'password_hash',
  'hashed_password',
  'new_password',
  'old_password',
  'current_password',
  'secret',
  'client_secret',
  'secret_key',
  'private_key',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'invite_token',
  'reset_token',
  'api_key',
  'key_hash',
  'authorization',
  'cookie',
  'set_cookie',
  'otp',
  'otp_code',
  'access_code',
  'verification_code'
])

// Suffixes that make any field a secret (`stripe_client_secret`, `oauth_refresh_token`,
// `service_api_key`, ...).
const SECRET_SUFFIXES = ['_password', '_secret', '_token', '_hash', '_private_key', '_api_key']

// Fields that describe a secret without being one: identifiers, prefixes, counts, expiry times,
// timestamps and flags. They win over the secret rules above.
const SAFE_SUFFIXES = ['_id', '_ids', '_prefix', '_count', '_expires', '_expires_at', '_at', '_stored', '_type', '_length']
const SAFE_PREFIXES = ['last_', 'is_', 'has_']

// `apiKey`, `api-key` and `API_KEY` all read as `api_key`.
export function normalizeAuditKey(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
}

export function isSensitiveAuditKey(key: string): boolean {
  const name = normalizeAuditKey(key)
  if (SAFE_PREFIXES.some(prefix => name.startsWith(prefix))) return false
  if (SAFE_SUFFIXES.some(suffix => name.endsWith(suffix))) return false
  if (SECRET_NAMES.has(name)) return true
  return SECRET_SUFFIXES.some(suffix => name.endsWith(suffix))
}

// A copy of the payload with every secret field's value (whatever its shape) replaced by
// REDACTED, recursing through nested objects and arrays. Null secrets stay null: there is
// nothing to hide, and "no value" is part of what the event says.
export function redactAuditPayload<T>(value: T): T {
  return redactValue(value) as T
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, child]) => [
    key,
    isSensitiveAuditKey(key) && child != null ? REDACTED : redactValue(child)
  ]))
}
