import { describe, expect, it } from 'vitest'
import {
  LIBRARY_DEFAULT_POLICY,
  passwordLength,
  passwordPolicyHint,
  passwordPolicyProblem,
  resolvePasswordPolicy
} from '~/utils/password-policy'
import { newPasswordSchemaFor } from '~/schemas/auth-flows'
import type { PasswordPolicy } from '~/types/auth'

// The console mirrors outlabs-auth's validate_password_strength (utils/password.py) and the
// request models' 8..128 bounds, so a password is refused on its field for exactly the reason the
// server would refuse it, and never refused when the server would take it.

const policy = (overrides: Partial<PasswordPolicy> = {}): PasswordPolicy => ({ ...LIBRARY_DEFAULT_POLICY, ...overrides })
const accepts = (value: string, p: PasswordPolicy = LIBRARY_DEFAULT_POLICY) => passwordPolicyProblem(value, p) === null

describe('resolvePasswordPolicy', () => {
  it('uses the library default while no policy is published', () => {
    expect(resolvePasswordPolicy(undefined)).toEqual(LIBRARY_DEFAULT_POLICY)
    expect(resolvePasswordPolicy(null)).toEqual(LIBRARY_DEFAULT_POLICY)
    expect(resolvePasswordPolicy('strict')).toEqual(LIBRARY_DEFAULT_POLICY)
  })

  it('has the backslash among the default symbols', () => {
    expect(LIBRARY_DEFAULT_POLICY.special_characters).toBe('!@#$%^&*(),.?":{}|<>\\')
  })

  it('takes the published rules, with the request models\' bounds applied', () => {
    expect(resolvePasswordPolicy(policy({ min_length: 12, require_digit: false }))).toEqual(policy({ min_length: 12, require_digit: false }))
    // Every request model refuses fewer than 8 characters (422), whatever the host's policy says.
    expect(resolvePasswordPolicy(policy({ min_length: 6 })).min_length).toBe(8)
    expect(resolvePasswordPolicy(policy({ max_length: 500 })).max_length).toBe(128)
  })

  it('keeps the default for a field it cannot read', () => {
    const resolved = resolvePasswordPolicy({ min_length: 'ten', require_uppercase: 'yes', require_digit: false })
    expect(resolved).toEqual(policy({ require_digit: false }))
  })
})

describe('passwordPolicyProblem', () => {
  it('counts code points, as the server does', () => {
    expect(passwordLength('Aa1!😀')).toBe(5)
    // Seven characters and an emoji: eight, enough.
    expect(accepts('Aa1!bcd😀')).toBe(true)
    expect(passwordPolicyProblem('Aa1!bc😀', LIBRARY_DEFAULT_POLICY)).toBe('Password must be at least 8 characters.')
    expect(accepts(`Aa1!${'😀'.repeat(124)}`)).toBe(true)
    expect(passwordPolicyProblem(`Aa1!${'😀'.repeat(125)}`, LIBRARY_DEFAULT_POLICY)).toBe('Password must be at most 128 characters.')
  })

  it('applies at least 8 characters even when the policy asks for fewer', () => {
    const lax = resolvePasswordPolicy(policy({ min_length: 4 }))
    expect(passwordPolicyProblem('Aa1!bcd', lax)).toBe('Password must be at least 8 characters.')
    expect(passwordPolicyProblem('Aa1!bcdefgh', policy({ min_length: 12 }))).toBe('Password must be at least 12 characters.')
  })

  it('answers the first rule broken, in the server\'s order', () => {
    expect(passwordPolicyProblem('short', LIBRARY_DEFAULT_POLICY)).toBe('Password must be at least 8 characters.')
    expect(passwordPolicyProblem('lowercase', LIBRARY_DEFAULT_POLICY)).toBe('Add an uppercase letter (A to Z).')
    expect(passwordPolicyProblem('UPPERCASE', LIBRARY_DEFAULT_POLICY)).toBe('Add a lowercase letter (a to z).')
    expect(passwordPolicyProblem('Mixedcase', LIBRARY_DEFAULT_POLICY)).toBe('Add a digit.')
    expect(passwordPolicyProblem('Mixedcase1', LIBRARY_DEFAULT_POLICY)).toBe('Add a symbol: one of ! @ # $ % ^ & * ( ) , . ? " : { } | < > \\.')
  })

  it('counts only A to Z and a to z as upper and lower case letters', () => {
    expect(passwordPolicyProblem('ÉÑÜxyz1!', LIBRARY_DEFAULT_POLICY)).toBe('Add an uppercase letter (A to Z).')
    expect(passwordPolicyProblem('ABCDEñé1!', LIBRARY_DEFAULT_POLICY)).toBe('Add a lowercase letter (a to z).')
    expect(accepts('ÉÑÜxyZ1!')).toBe(true)
  })

  it('accepts any Unicode decimal digit, like Python\'s \\d', () => {
    // Arabic-Indic three and Devanagari seven.
    expect(accepts('Password٣!')).toBe(true)
    expect(accepts('Password७!')).toBe(true)
    // A superscript two is not a decimal digit.
    expect(passwordPolicyProblem('Password²!', LIBRARY_DEFAULT_POLICY)).toBe('Add a digit.')
  })

  it('accepts exactly the published symbols', () => {
    expect(accepts('Testpass1\\')).toBe(true)
    expect(accepts('Testpass1"')).toBe(true)
    expect(accepts('Testpass1-')).toBe(false)
    expect(accepts('Testpass1_')).toBe(false)
    const custom = policy({ special_characters: '-_' })
    expect(accepts('Testpass1-', custom)).toBe(true)
    expect(passwordPolicyProblem('Testpass1!', custom)).toBe('Add a symbol: one of - _.')
  })

  it('skips the rules the policy turns off', () => {
    expect(accepts('Testpass1', policy({ require_special_char: false }))).toBe(true)
    expect(accepts('testpass1!', policy({ require_uppercase: false }))).toBe(true)
    expect(accepts('TESTPASS1!', policy({ require_lowercase: false }))).toBe(true)
    expect(accepts('Testpass!', policy({ require_digit: false }))).toBe(true)
    expect(accepts('anything', policy({ require_uppercase: false, require_lowercase: false, require_digit: false, require_special_char: false }))).toBe(true)
  })

  it('is what the new-password schema reports', () => {
    const schema = newPasswordSchemaFor(policy({ min_length: 10 }))
    expect(schema.safeParse('Testpass1!').success).toBe(true)
    expect(schema.safeParse('Testpas1!').error?.issues.map(issue => issue.message)).toEqual(['Password must be at least 10 characters.'])
  })
})

describe('passwordPolicyHint', () => {
  it('states the default policy with its symbols', () => {
    expect(passwordPolicyHint(LIBRARY_DEFAULT_POLICY)).toBe(
      'At least 8 characters, with an uppercase and a lowercase letter, a digit and a symbol (! @ # $ % ^ & * ( ) , . ? " : { } | < > \\).'
    )
  })

  it('states only the rules a policy has', () => {
    expect(passwordPolicyHint(policy({ min_length: 12, require_special_char: false }))).toBe('At least 12 characters, with an uppercase and a lowercase letter and a digit.')
    expect(passwordPolicyHint(policy({ require_uppercase: false, require_digit: false, require_special_char: false }))).toBe('At least 8 characters, with a lowercase letter.')
    expect(passwordPolicyHint(policy({ require_lowercase: false, require_special_char: false }))).toBe('At least 8 characters, with an uppercase letter and a digit.')
    expect(passwordPolicyHint(policy({ require_uppercase: false, require_lowercase: false, require_digit: false, special_characters: '-_' }))).toBe('At least 8 characters, with a symbol (- _).')
    expect(passwordPolicyHint(policy({ require_uppercase: false, require_lowercase: false, require_digit: false, require_special_char: false }))).toBe('At least 8 characters.')
  })
})
