import type { PasswordPolicy } from '~/types/auth'

// The password policy the backend publishes in /auth/config (`password_policy`), mirrored exactly
// so a new password is refused on its field before it is sent, for the same reason the server
// would refuse it. outlabs-auth checks every password write (register, reset, accept invite,
// change, admin set, create user) in this order and answers the first rule that fails:
// length, an ASCII uppercase letter, an ASCII lowercase letter, a digit (Python's `\d`: any
// Unicode decimal digit) and one of `special_characters`. Lengths are counted in code points
// (Python's `len`). Pure, so every rule is unit-tested; the server stays authoritative and its
// refusal (INVALID_PASSWORD) still lands on the field.

// The request models' own bounds (Pydantic min_length/max_length on every new-password field):
// a password shorter than 8 is refused with 422 even when the host's policy allows fewer.
export const PASSWORD_REQUEST_MIN_LENGTH = 8
export const PASSWORD_REQUEST_MAX_LENGTH = 128

// outlabs-auth 0.1.0a35's defaults, used only while the backend's policy is unknown (its
// /auth/config failed to load). The backslash is one of the symbols.
export const LIBRARY_DEFAULT_POLICY: PasswordPolicy = Object.freeze({
  min_length: 8,
  max_length: 128,
  require_uppercase: true,
  require_lowercase: true,
  require_digit: true,
  require_special_char: true,
  special_characters: '!@#$%^&*(),.?":{}|<>\\'
})

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : null
}

/**
 * The policy a new password must meet: the published one with the request models' bounds
 * applied (at least 8, at most 128 code points), or the library default when nothing usable was
 * published. A flag that is not a boolean keeps the default.
 */
export function resolvePasswordPolicy(published: unknown): PasswordPolicy {
  if (published == null || typeof published !== 'object') return LIBRARY_DEFAULT_POLICY
  const p = published as Partial<Record<keyof PasswordPolicy, unknown>>
  const flag = (key: 'require_uppercase' | 'require_lowercase' | 'require_digit' | 'require_special_char') =>
    typeof p[key] === 'boolean' ? p[key] as boolean : LIBRARY_DEFAULT_POLICY[key]
  const min = Math.max(PASSWORD_REQUEST_MIN_LENGTH, positiveInteger(p.min_length) ?? LIBRARY_DEFAULT_POLICY.min_length)
  const max = Math.min(PASSWORD_REQUEST_MAX_LENGTH, positiveInteger(p.max_length) ?? LIBRARY_DEFAULT_POLICY.max_length)
  return {
    min_length: min,
    max_length: Math.max(min, max),
    require_uppercase: flag('require_uppercase'),
    require_lowercase: flag('require_lowercase'),
    require_digit: flag('require_digit'),
    require_special_char: flag('require_special_char'),
    special_characters: typeof p.special_characters === 'string' ? p.special_characters : LIBRARY_DEFAULT_POLICY.special_characters
  }
}

/** A password's length as the server counts it: code points, so an emoji is one character. */
export function passwordLength(value: string): number {
  return [...value].length
}

// The symbols as a readable list: "! @ # $ … \".
function symbolList(policy: PasswordPolicy): string {
  return [...policy.special_characters].join(' ')
}

/**
 * The first rule a new password breaks, in the server's order, as the message for its field;
 * null when the password meets the policy.
 */
export function passwordPolicyProblem(value: string, policy: PasswordPolicy): string | null {
  const length = passwordLength(value)
  if (length < policy.min_length) return `Password must be at least ${policy.min_length} characters.`
  if (length > policy.max_length) return `Password must be at most ${policy.max_length} characters.`
  if (policy.require_uppercase && !/[A-Z]/.test(value)) return 'Add an uppercase letter (A to Z).'
  if (policy.require_lowercase && !/[a-z]/.test(value)) return 'Add a lowercase letter (a to z).'
  if (policy.require_digit && !/\p{Nd}/u.test(value)) return 'Add a digit.'
  if (policy.require_special_char && ![...value].some(char => policy.special_characters.includes(char))) {
    return policy.special_characters ? `Add a symbol: one of ${symbolList(policy)}.` : 'Add a symbol.'
  }
  return null
}

function listSentence(parts: string[]): string {
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`
}

/**
 * The policy as the help text under a new-password field, e.g. "At least 10 characters, with an
 * uppercase and a lowercase letter, a digit and a symbol (! @ # $ % ^ & * ( ) , . ? " : { } | < > \)."
 */
export function passwordPolicyHint(policy: PasswordPolicy): string {
  const parts: string[] = []
  if (policy.require_uppercase && policy.require_lowercase) parts.push('an uppercase and a lowercase letter')
  else if (policy.require_uppercase) parts.push('an uppercase letter')
  else if (policy.require_lowercase) parts.push('a lowercase letter')
  if (policy.require_digit) parts.push('a digit')
  if (policy.require_special_char) parts.push(policy.special_characters ? `a symbol (${symbolList(policy)})` : 'a symbol')
  const length = `At least ${policy.min_length} characters`
  return parts.length ? `${length}, with ${listSentence(parts)}.` : `${length}.`
}
