import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  cooldownKey,
  cooldownLabel,
  cooldownSecondsLeft,
  isRateLimitedError,
  parseCooldownStore,
  parseRetryAfterHeader,
  pruneCooldowns,
  retryAfterSecondsFrom
} from '~/utils/request-cooldown'
import { authRouteAllowsSignedIn, postSignInDestination, safeAuthRedirect } from '~/utils/auth-redirect'
import {
  accessCodeChannelLabel,
  magicLinkFailure,
  oauthErrorMessage,
  oauthProviderLabel,
  passwordPolicyError
} from '~/utils/auth-messages'
import { PENDING_CHALLENGE_TTL_MS, parsePendingChallenge } from '~/auth/pending-challenge'
import { PENDING_OAUTH_TTL_MS, parsePendingOAuth } from '~/auth/pending-oauth'
import { PHONE_CODES, phoneCodeFor } from '~/data/phone-codes'
import {
  E164_PHONE_RE,
  emailIdentifierSchema,
  newPasswordSchema,
  normalizePhone,
  registerSchema,
  setPasswordSchema
} from '~/schemas/auth-flows'
import { resolveProductionRuntimeConfig } from '~/utils/runtime-config'

const NOW = Date.UTC(2026, 8, 30, 12, 0, 0)

describe('request cooldowns', () => {
  it('reads the wait from every error shape the backend uses', () => {
    // Global handler: { error, message, details: {...} }
    expect(retryAfterSecondsFrom({ status: 429, data: { error: 'HTTP_ERROR', details: { retry_after_seconds: 42 } } })).toBe(42)
    // auth_only mode (bare FastAPI): { detail: {...} }
    expect(retryAfterSecondsFrom({ status: 429, data: { detail: { retry_after_seconds: 17.2 } } })).toBe(18)
    // RateLimitError at the top level
    expect(retryAfterSecondsFrom({ status: 429, data: { retry_after_seconds: 5 } })).toBe(5)
    // Header only (delta-seconds and HTTP date)
    expect(retryAfterSecondsFrom({ status: 429, data: null, retryAfter: '90' }, NOW)).toBe(90)
    expect(retryAfterSecondsFrom({ status: 429, data: {}, retryAfter: new Date(NOW + 30_000).toUTCString() }, NOW)).toBe(30)
    // Body wins over the header
    expect(retryAfterSecondsFrom({ status: 429, data: { details: { retry_after_seconds: 12 } }, retryAfter: '99' })).toBe(12)
  })

  it('ignores missing, zero, negative and malformed waits', () => {
    expect(retryAfterSecondsFrom({ status: 429, data: { details: {} } })).toBeNull()
    expect(retryAfterSecondsFrom({ status: 429, data: { details: { retry_after_seconds: 0 } } })).toBeNull()
    expect(retryAfterSecondsFrom({ status: 429, data: { details: { retry_after_seconds: -3 } } })).toBeNull()
    expect(retryAfterSecondsFrom(null)).toBeNull()
    expect(parseRetryAfterHeader('soon', NOW)).toBeNull()
    expect(parseRetryAfterHeader(new Date(NOW - 5000).toUTCString(), NOW)).toBeNull()
  })

  it('recognizes a rate-limited answer', () => {
    expect(isRateLimitedError({ status: 429 })).toBe(true)
    expect(isRateLimitedError({ status: 401 })).toBe(false)
    expect(isRateLimitedError(undefined)).toBe(false)
  })

  it('counts down in whole seconds and labels buttons', () => {
    expect(cooldownSecondsLeft(NOW + 59_001, NOW)).toBe(60)
    expect(cooldownSecondsLeft(NOW - 1, NOW)).toBe(0)
    expect(cooldownSecondsLeft(undefined, NOW)).toBe(0)
    expect(cooldownLabel('Resend code', 42)).toBe('Resend code in 42s')
    expect(cooldownLabel('Resend code', 0)).toBe('Resend code')
  })

  it('keys by kind and normalized identifier', () => {
    expect(cooldownKey('code:email', ' Admin@Acme.com ')).toBe('code:email:admin@acme.com')
  })

  it('restores only valid, unexpired entries from storage', () => {
    const raw = JSON.stringify({ a: NOW + 1000, b: NOW - 1000, c: 'nope' })
    expect(parseCooldownStore(raw, NOW)).toEqual({ a: NOW + 1000 })
    expect(parseCooldownStore('not json', NOW)).toEqual({})
    expect(parseCooldownStore('[1,2]', NOW)).toEqual({})
    expect(pruneCooldowns({ a: NOW + 1, b: NOW }, NOW)).toEqual({ a: NOW + 1 })
  })
})

describe('post-sign-in destinations', () => {
  const origin = 'https://console.example.com'

  it('accepts in-app paths and same-origin absolute URLs', () => {
    expect(safeAuthRedirect('/app/users?page=2', origin)).toBe('/app/users?page=2')
    expect(safeAuthRedirect('https://console.example.com/app/users#top', origin)).toBe('/app/users#top')
  })

  it('refuses everything else', () => {
    expect(safeAuthRedirect('https://evil.example.com/app/users', origin)).toBeNull()
    expect(safeAuthRedirect('https://user:pw@console.example.com/app/users', origin)).toBeNull()
    expect(safeAuthRedirect('https://console.example.com/', origin)).toBeNull()
    expect(safeAuthRedirect('//evil.example.com/app/x', origin)).toBeNull()
    expect(safeAuthRedirect('/auth/login', origin)).toBeNull()
    expect(safeAuthRedirect('javascript:alert(1)', origin)).toBeNull()
    expect(safeAuthRedirect('https://console.example.com/app/users', null)).toBeNull()
    expect(safeAuthRedirect(['/app/users'], origin)).toBeNull()
  })

  it('prefers the server-validated next_url, then ?redirect, then the dashboard', () => {
    expect(postSignInDestination({ nextUrl: 'https://console.example.com/app/roles', redirect: '/app/users', origin })).toBe('/app/roles')
    // The backend's default next_url is the profile root: not an app page, so ?redirect wins.
    expect(postSignInDestination({ nextUrl: 'https://console.example.com/', redirect: '/app/users', origin })).toBe('/app/users')
    expect(postSignInDestination({ nextUrl: null, redirect: undefined, origin })).toBe('/app/dashboard')
  })

  it('lets a signed-in browser open only the link landings that must work or ask first', () => {
    expect(authRouteAllowsSignedIn('/auth/reset-password', {})).toBe(true)
    expect(authRouteAllowsSignedIn('/auth/magic-link', { token: 'abc' })).toBe(true)
    expect(authRouteAllowsSignedIn('/auth/accept-invite', { token: 'abc' })).toBe(true)
    expect(authRouteAllowsSignedIn('/auth/magic-link', {})).toBe(false)
    expect(authRouteAllowsSignedIn('/auth/accept-invite', { token: '' })).toBe(false)
    expect(authRouteAllowsSignedIn('/auth/login', { token: 'abc' })).toBe(false)
    expect(authRouteAllowsSignedIn('/auth/access-code', {})).toBe(false)
  })

  it('treats a trailing slash from a static host as the same landing', () => {
    expect(authRouteAllowsSignedIn('/auth/magic-link/', { token: 'abc' })).toBe(true)
    expect(authRouteAllowsSignedIn('/auth/accept-invite//', { token: 'abc' })).toBe(true)
    expect(authRouteAllowsSignedIn('/auth/reset-password/', {})).toBe(true)
    expect(authRouteAllowsSignedIn('/auth/magic-link/', {})).toBe(false)
    expect(authRouteAllowsSignedIn('/auth/magic-link-extra', { token: 'abc' })).toBe(false)
    expect(authRouteAllowsSignedIn('/auth/reset-passwords', {})).toBe(false)
    expect(authRouteAllowsSignedIn('/auth/login/', { token: 'abc' })).toBe(false)
  })
})

describe('guest-surface messages', () => {
  it('names access-code channels the same way everywhere', () => {
    expect(accessCodeChannelLabel('email')).toBe('Email')
    expect(accessCodeChannelLabel('whatsapp')).toBe('WhatsApp')
    expect(accessCodeChannelLabel('sms')).toBe('SMS')
    // Mid-sentence only the common noun is lowercased; brand spellings stay.
    expect(accessCodeChannelLabel('email', 'inline')).toBe('email')
    expect(accessCodeChannelLabel('whatsapp', 'inline')).toBe('WhatsApp')
    expect(accessCodeChannelLabel('sms', 'inline')).toBe('SMS')
  })

  it('gives every OAuth error code its own copy', () => {
    // The codes the backend's OAuth callback redirects with (routers/oauth.py).
    const codes = ['wrong_application', 'unknown_account', 'account_exists', 'inactive', 'invalid_state', 'provider', 'auth']
    const titles = codes.map(code => oauthErrorMessage(code).title)
    expect(new Set(titles).size).toBe(codes.length)
    expect(oauthErrorMessage('account_exists').description).toMatch(/link the provider from your Account page/)
    expect(oauthErrorMessage('wrong_application', 'console').description).toMatch(/"console"/)
    expect(oauthErrorMessage('something_new').title).toBe('Sign-in could not be completed')
  })

  it('spells provider brands', () => {
    expect(oauthProviderLabel('github')).toBe('GitHub')
    expect(oauthProviderLabel('Google')).toBe('Google')
    expect(oauthProviderLabel('okta')).toBe('Okta')
  })

  it('tells magic-link failures apart', () => {
    expect(magicLinkFailure({ status: 401, data: { error: 'TOKEN_EXPIRED', message: 'Magic link has expired' } })).toMatchObject({ title: 'This link has expired', requestNewLink: true, retry: false })
    expect(magicLinkFailure({ status: 401, data: { error: 'TOKEN_INVALID', message: 'Magic link has already been used' } })).toMatchObject({ title: 'This link was already used', requestNewLink: true })
    expect(magicLinkFailure({ status: 401, data: { error: 'TOKEN_INVALID', message: 'Invalid or expired magic link' } })).toMatchObject({ title: 'This link is not valid', requestNewLink: true })
    expect(magicLinkFailure({ status: 403, data: { detail: { code: 'wrong_application' } } }, 'console')).toMatchObject({ title: 'This console cannot sign you in', requestNewLink: false })
    expect(magicLinkFailure({ status: 0, kind: 'network', data: null })).toMatchObject({ retry: true, requestNewLink: false })
    expect(magicLinkFailure({ status: 503, data: null })).toMatchObject({ retry: true })
    expect(magicLinkFailure({ status: 401, data: { error: 'ACCOUNT_LOCKED', message: 'Locked for 10 minutes' } })).toMatchObject({ description: 'Locked for 10 minutes', requestNewLink: false })
  })

  it('recognizes the backend password-policy refusal', () => {
    expect(passwordPolicyError({ status: 400, data: { error: 'INVALID_PASSWORD', message: 'Password must contain at least one special character', details: { password_requirements: {} } } }))
      .toBe('Password must contain at least one special character')
    expect(passwordPolicyError({ status: 400, data: { detail: { password_requirements: {} } } })).toBe('Choose a stronger password.')
    expect(passwordPolicyError({ status: 401, data: { error: 'TOKEN_INVALID', message: 'x' } })).toBeNull()
    expect(passwordPolicyError(new Error('network'))).toBeNull()
  })
})

describe('pending sign-in step', () => {
  it('keeps a valid record', () => {
    const raw = JSON.stringify({ phone: '+5491155551234', code: { channel: 'sms', identifier: '+5491155551234' }, savedAt: NOW - 1000 })
    expect(parsePendingChallenge(raw, NOW)).toEqual({ phone: '+5491155551234', code: { channel: 'sms', identifier: '+5491155551234' }, savedAt: NOW - 1000 })
  })

  it('drops expired, malformed and empty records', () => {
    expect(parsePendingChallenge(JSON.stringify({ email: 'a@example.com', savedAt: NOW - PENDING_CHALLENGE_TTL_MS - 1 }), NOW)).toBeNull()
    expect(parsePendingChallenge(JSON.stringify({ savedAt: NOW }), NOW)).toBeNull()
    expect(parsePendingChallenge('{', NOW)).toBeNull()
    expect(parsePendingChallenge(null, NOW)).toBeNull()
    // An unknown channel drops the code but keeps the rest.
    expect(parsePendingChallenge(JSON.stringify({ email: 'a@example.com', code: { channel: 'pigeon', identifier: 'x' }, savedAt: NOW }), NOW))
      .toEqual({ email: 'a@example.com', savedAt: NOW })
  })
})

describe('pending OAuth sign-in marker', () => {
  const nonce = '0123456789abcdef0123456789abcdef'

  it('accepts a marker written within the window', () => {
    expect(parsePendingOAuth(JSON.stringify({ nonce, startedAt: NOW - 1000 }), NOW)).toEqual({ nonce, startedAt: NOW - 1000 })
    // A provider's own MFA and consent screens must fit: the window is 15 to 30 minutes.
    expect(PENDING_OAUTH_TTL_MS).toBeGreaterThanOrEqual(15 * 60 * 1000)
    expect(PENDING_OAUTH_TTL_MS).toBeLessThanOrEqual(30 * 60 * 1000)
    expect(parsePendingOAuth(JSON.stringify({ nonce, startedAt: NOW - PENDING_OAUTH_TTL_MS }), NOW)).not.toBeNull()
  })

  it('refuses a missing, expired, future-dated or malformed marker', () => {
    expect(parsePendingOAuth(null, NOW)).toBeNull()
    expect(parsePendingOAuth('', NOW)).toBeNull()
    expect(parsePendingOAuth('{', NOW)).toBeNull()
    expect(parsePendingOAuth('"pending"', NOW)).toBeNull()
    expect(parsePendingOAuth(JSON.stringify({ nonce, startedAt: NOW - PENDING_OAUTH_TTL_MS - 1 }), NOW)).toBeNull()
    expect(parsePendingOAuth(JSON.stringify({ nonce, startedAt: NOW + 5 * 60 * 1000 }), NOW)).toBeNull()
    expect(parsePendingOAuth(JSON.stringify({ nonce: 'short', startedAt: NOW }), NOW)).toBeNull()
    expect(parsePendingOAuth(JSON.stringify({ startedAt: NOW }), NOW)).toBeNull()
    expect(parsePendingOAuth(JSON.stringify({ nonce, startedAt: String(NOW) }), NOW)).toBeNull()
  })
})

describe('phone country data', () => {
  it('ships every territory with Argentina carrying both mobile masks', () => {
    expect(PHONE_CODES).toHaveLength(245)
    expect(phoneCodeFor('ar')).toMatchObject({ code: 'AR', dialCode: '+54', mask: ['## ####-####', '### #### ####'] })
  })

  it('falls back to the United States for an unknown country', () => {
    expect(phoneCodeFor('ZZ').code).toBe('US')
    expect(phoneCodeFor(undefined).dialCode).toBe('+1')
  })

  it('composes E.164 numbers, including shared-code territories shown as +1-xxx', () => {
    const antigua = phoneCodeFor('AG')
    expect(antigua.dialCode).toBe('+1-268')
    expect(normalizePhone('555-1234', antigua.dialCode, 'AG')).toBe('+12685551234')
    expect(normalizePhone('555 1234', phoneCodeFor('JM').dialCode, 'JM')).toBe('+18765551234')
    expect(normalizePhone('020 7946 0018', '+44', 'GB')).toBe('+442079460018')
    // Argentina: the mobile 9 is added to the 10-digit national form, never doubled.
    expect(normalizePhone('11 5555-1234', '+54', 'AR')).toBe('+5491155551234')
    expect(normalizePhone('911 5555 1234', '+54', 'AR')).toBe('+5491155551234')
    expect(normalizePhone('+541155551234', '+54', 'AR')).toBe('+5491155551234')
    // A number typed in international form wins over the picker.
    expect(normalizePhone('+1 268 555 1234', '+54', 'AR')).toBe('+12685551234')

    // Every territory's national number composes into valid E.164.
    for (const entry of PHONE_CODES) {
      const national = entry.code === 'AR' ? '1155551234' : '5551234'
      expect(normalizePhone(national, entry.dialCode, entry.code), entry.name).toMatch(E164_PHONE_RE)
    }
  })
})

describe('auth form schemas', () => {
  it('mirrors the backend default password policy', () => {
    expect(newPasswordSchema.safeParse('Testpass1!').success).toBe(true)
    for (const weak of ['short1!', 'testpass1!', 'TESTPASS1!', 'Testpass!!', 'Testpass11', 'My-long_pass1']) {
      expect(newPasswordSchema.safeParse(weak).success, weak).toBe(false)
    }
  })

  it('checks the confirmation', () => {
    const mismatch = setPasswordSchema.safeParse({ new_password: 'Testpass1!', confirm_password: 'Testpass2!' })
    expect(mismatch.success).toBe(false)
    expect(mismatch.error?.issues.map(i => i.message)).toContain('Passwords must match.')
    expect(registerSchema.safeParse({ email: 'new@example.com', password: 'Testpass1!', confirm_password: 'Testpass1!' }).success).toBe(true)
  })

  it('requires a valid email on the email identifier', () => {
    expect(emailIdentifierSchema.safeParse({ identifier: ' person@example.com ' }).success).toBe(true)
    expect(emailIdentifierSchema.safeParse({ identifier: '+5491155551234' }).success).toBe(false)
  })
})

describe('runtime config: auth branding and code length', () => {
  const base = { apiBaseUrl: 'https://api.example.com', authApiPrefix: '/v1' }

  it('uses the light-ink default logo in dark mode only with the default logo', () => {
    const defaults = resolveProductionRuntimeConfig(base)
    expect(defaults.status === 'ready' && defaults.config.authLogoDarkUrl).toBe('/brand/outlabs-auth-logo-dark.svg')

    const custom = resolveProductionRuntimeConfig({ ...base, authLogoUrl: '/brand/acme.svg' })
    expect(custom.status === 'ready' && custom.config.authLogoDarkUrl).toBe('/brand/acme.svg')

    const both = resolveProductionRuntimeConfig({ ...base, authLogoUrl: '/brand/acme.svg', authLogoDarkUrl: '/brand/acme-dark.svg' })
    expect(both.status === 'ready' && both.config.authLogoDarkUrl).toBe('/brand/acme-dark.svg')
  })

  it('lets a config copied from the template rebrand both modes by changing authLogoUrl alone', () => {
    const template = JSON.parse(readFileSync(fileURLToPath(new URL('../../public/app-config.template.json', import.meta.url)), 'utf8')) as Record<string, unknown>
    expect(template).not.toHaveProperty('authLogoDarkUrl')

    const asShipped = resolveProductionRuntimeConfig({ ...template, apiBaseUrl: 'https://api.example.com' })
    expect(asShipped.status === 'ready' && asShipped.config.authLogoDarkUrl).toBe('/brand/outlabs-auth-logo-dark.svg')

    const rebranded = resolveProductionRuntimeConfig({ ...template, apiBaseUrl: 'https://api.example.com', authLogoUrl: 'https://assets.example.com/acme.svg' })
    expect(rebranded.status === 'ready' && rebranded.config.authLogoDarkUrl).toBe('https://assets.example.com/acme.svg')
  })

  it('accepts an authUi.otpLength between 4 and 12 only', () => {
    const eight = resolveProductionRuntimeConfig({ ...base, authUi: { otpLength: 8 } })
    expect(eight.status === 'ready' && eight.config.authUi.otpLength).toBe(8)
    const fromEnv = resolveProductionRuntimeConfig({ ...base, authUi: { otpLength: '4' } })
    expect(fromEnv.status === 'ready' && fromEnv.config.authUi.otpLength).toBe(4)
    const invalid = resolveProductionRuntimeConfig({ ...base, authUi: { otpLength: 20 } })
    expect(invalid.status === 'ready' && invalid.config.authUi.otpLength).toBeUndefined()
  })
})
