import { describe, expect, it } from 'vitest'
import {
  addToSpentRefreshLedger,
  isBearerRejection,
  isDefinitiveRefreshFailure,
  isSessionEndReason,
  myPermissionsPath,
  readJwtSubject,
  readSpentRefreshLedger,
  safeAppRedirect,
  sessionEndReasonFromRefreshFailure,
  spentRefreshLedgerHas,
  tokenFingerprint,
  tokensNameDifferentSubjects
} from '../../app/utils/session-lifecycle'

// Shapes taken from the backend: the auth dependency's 401 in the wrapped (global handler)
// and bare (auth_only handler) forms, and OutlabsAuthException bodies { error, message, details }.
const wrappedNotAuthenticated = { error: 'HTTP_ERROR', message: 'Not authenticated', details: { detail: 'Not authenticated' } }
const bareNotAuthenticated = { detail: 'Not authenticated' }
const wrongPassword = { error: 'INVALID_CREDENTIALS', message: 'Current password is incorrect', details: {} }
const wrongCode = { error: 'TOKEN_INVALID', message: 'Invalid or expired verification code', details: { reason: 'token_not_found' } }

describe('isBearerRejection', () => {
  it('treats the auth dependency 401 (either handler mode) as a refused bearer token', () => {
    expect(isBearerRejection(wrappedNotAuthenticated)).toBe(true)
    expect(isBearerRejection(bareNotAuthenticated)).toBe(true)
    expect(isBearerRejection(null)).toBe(true)
    expect(isBearerRejection({ error: 'AUTHENTICATION_ERROR', message: 'x' })).toBe(true)
  })

  it('never renews on a domain answer', () => {
    expect(isBearerRejection(wrongPassword)).toBe(false)
    expect(isBearerRejection({ error: 'ACCOUNT_LOCKED' })).toBe(false)
    expect(isBearerRejection({ error: 'ACCOUNT_INACTIVE' })).toBe(false)
    expect(isBearerRejection({ error: 'API_KEY_INVALID' })).toBe(false)
    expect(isBearerRejection({ error: 'PERMISSION_DENIED' })).toBe(false)
  })

  it('treats TOKEN_* codes as answers only on secret-verifying endpoints', () => {
    expect(isBearerRejection(wrongCode)).toBe(true)
    expect(isBearerRejection(wrongCode, { verifiesSecret: true })).toBe(false)
    expect(isBearerRejection({ error: 'TOKEN_EXPIRED' }, { verifiesSecret: true })).toBe(false)
    // The auth dependency's own refusal still renews on those endpoints.
    expect(isBearerRejection(wrappedNotAuthenticated, { verifiesSecret: true })).toBe(true)
  })
})

describe('isDefinitiveRefreshFailure', () => {
  it('ends the session on the refresh endpoint\'s own refusals', () => {
    for (const status of [400, 401, 403, 422]) expect(isDefinitiveRefreshFailure(status)).toBe(true)
    expect(isDefinitiveRefreshFailure(401, { error: 'REFRESH_TOKEN_INVALID', details: { reason: 'expired' } })).toBe(true)
    // A deleted account: the library's own 404.
    expect(isDefinitiveRefreshFailure(404, { error: 'USER_NOT_FOUND', message: 'User not found' })).toBe(true)
  })

  it('keeps the session on transient answers', () => {
    for (const status of [0, 408, 429, 500, 502, 503, 504]) expect(isDefinitiveRefreshFailure(status)).toBe(false)
  })

  it('keeps the session when a proxy or a missing route answers instead of the endpoint', () => {
    expect(isDefinitiveRefreshFailure(404)).toBe(false)
    expect(isDefinitiveRefreshFailure(404, { detail: 'Not Found' })).toBe(false)
    for (const status of [405, 409, 410, 413, 415]) expect(isDefinitiveRefreshFailure(status)).toBe(false)
  })
})

describe('sessionEndReasonFromRefreshFailure', () => {
  it('maps the backend refresh-failure details', () => {
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'REFRESH_TOKEN_INVALID', details: { reason: 'reuse_detected' } })).toBe('reuse_detected')
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'REFRESH_TOKEN_INVALID', details: { reason: 'password_changed' } })).toBe('password_changed')
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'REFRESH_TOKEN_INVALID', details: { reason: 'revoked', revoked_reason: 'Password changed' } })).toBe('password_changed')
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'REFRESH_TOKEN_INVALID', details: { reason: 'revoked', revoked_reason: 'Password reset' } })).toBe('password_changed')
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'REFRESH_TOKEN_INVALID', details: { reason: 'revoked', revoked_reason: 'User logout' } })).toBe('revoked')
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'REFRESH_TOKEN_INVALID', details: { reason: 'expired' } })).toBe('expired')
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'REFRESH_TOKEN_INVALID', details: { reason: 'absolute_session_expired' } })).toBe('expired')
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'TOKEN_EXPIRED' })).toBe('expired')
    expect(sessionEndReasonFromRefreshFailure(401, { error: 'ACCOUNT_LOCKED' })).toBe('account_inactive')
    expect(sessionEndReasonFromRefreshFailure(403, { error: 'HTTP_ERROR', details: { code: 'wrong_application', message: 'x' } })).toBe('wrong_application')
    expect(sessionEndReasonFromRefreshFailure(404, { error: 'USER_NOT_FOUND' })).toBe('account_inactive')
    expect(sessionEndReasonFromRefreshFailure(401, null)).toBe('expired')
  })
})

describe('safeAppRedirect', () => {
  it('accepts in-app paths only', () => {
    expect(safeAppRedirect('/app/users?page=2')).toBe('/app/users?page=2')
    expect(safeAppRedirect('/app/dashboard')).toBe('/app/dashboard')
    expect(safeAppRedirect('/app')).toBeNull()
    expect(safeAppRedirect('https://evil.example/app/')).toBeNull()
    expect(safeAppRedirect('//evil.example/app/')).toBeNull()
    expect(safeAppRedirect('/app/\\evil')).toBeNull()
    expect(safeAppRedirect(['/app/users'])).toBeNull()
    expect(safeAppRedirect(undefined)).toBeNull()
  })
})

describe('isSessionEndReason', () => {
  it('accepts the known reasons only', () => {
    expect(isSessionEndReason('expired')).toBe(true)
    expect(isSessionEndReason('reuse_detected')).toBe(true)
    expect(isSessionEndReason('<script>')).toBe(false)
    expect(isSessionEndReason(null)).toBe(false)
  })
})

describe('myPermissionsPath', () => {
  it('follows the mounted surfaces', () => {
    expect(myPermissionsPath(['auth', 'users', 'permissions'])).toBe('/permissions/me')
    expect(myPermissionsPath(['auth', 'self_service_users'])).toBe('/users/me/permissions')
    expect(myPermissionsPath(['auth', 'users'])).toBeNull()
    expect(myPermissionsPath(undefined)).toBe('/permissions/me')
  })
})

describe('readJwtSubject', () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  it('reads the subject without verifying', () => {
    const token = `${encode({ alg: 'HS256' })}.${encode({ sub: '5f7c0a2e-1c1b-4b39-9d1e-2a9c1f1d0b7a', type: 'access' })}.sig`
    expect(readJwtSubject(token)).toBe('5f7c0a2e-1c1b-4b39-9d1e-2a9c1f1d0b7a')
  })
  it('returns null for opaque or malformed tokens', () => {
    expect(readJwtSubject('opaque-token')).toBeNull()
    expect(readJwtSubject('a.%%%.c')).toBeNull()
    expect(readJwtSubject(`${encode({})}.${encode({ sub: 42 })}.x`)).toBeNull()
    expect(readJwtSubject(null)).toBeNull()
  })
})

describe('tokensNameDifferentSubjects', () => {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const token = (sub: string, extra: object = {}) => `${encode({ alg: 'HS256' })}.${encode({ sub, type: 'access', ...extra })}.sig`
  it('is true only when both tokens name a subject and they differ', () => {
    expect(tokensNameDifferentSubjects(token('user-a'), token('user-b'))).toBe(true)
    // A rotation (or an expired copy) of the same account's token.
    expect(tokensNameDifferentSubjects(token('user-a', { exp: 1 }), token('user-a', { exp: 2 }))).toBe(false)
  })
  it('never claims a difference it cannot read', () => {
    expect(tokensNameDifferentSubjects('opaque-token', token('user-b'))).toBe(false)
    expect(tokensNameDifferentSubjects(token('user-a'), 'opaque-token')).toBe(false)
    expect(tokensNameDifferentSubjects(null, token('user-b'))).toBe(false)
    expect(tokensNameDifferentSubjects(token('user-a'), undefined)).toBe(false)
  })
})

describe('tokenFingerprint', () => {
  it('is stable for a token and differs between tokens', () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.signature-one'
    const sibling = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJhIn0.signature-two'
    expect(tokenFingerprint(token)).toBe(tokenFingerprint(token))
    expect(tokenFingerprint(token)).not.toBe(tokenFingerprint(sibling))
    expect(tokenFingerprint(token)).not.toBe(tokenFingerprint(`${token}x`))
    expect(tokenFingerprint(token)).not.toContain('signature')
  })
})

describe('spent refresh-token ledger', () => {
  const now = 1_700_000_000_000

  it('remembers the tokens it was told about, without storing them', () => {
    const ledger = addToSpentRefreshLedger([], 'refresh-one', now)
    expect(spentRefreshLedgerHas(ledger, 'refresh-one')).toBe(true)
    expect(spentRefreshLedgerHas(ledger, 'refresh-two')).toBe(false)
    expect(JSON.stringify(ledger)).not.toContain('refresh-one')
  })

  it('round-trips through storage and forgets old or unreadable entries', () => {
    const stored = JSON.stringify(addToSpentRefreshLedger(addToSpentRefreshLedger([], 'old', now - 11 * 60_000), 'recent', now))
    const ledger = readSpentRefreshLedger(stored, now)
    expect(spentRefreshLedgerHas(ledger, 'recent')).toBe(true)
    expect(spentRefreshLedgerHas(ledger, 'old')).toBe(false)
    expect(readSpentRefreshLedger(null, now)).toEqual([])
    expect(readSpentRefreshLedger('not json', now)).toEqual([])
    expect(readSpentRefreshLedger('{"fp":"x"}', now)).toEqual([])
    expect(readSpentRefreshLedger('[{"fp":1,"at":2},null]', now)).toEqual([])
  })

  it('keeps only the most recent entries', () => {
    let ledger = addToSpentRefreshLedger([], 'first', now)
    for (let i = 0; i < 20; i++) ledger = addToSpentRefreshLedger(ledger, `token-${i}`, now)
    expect(ledger.length).toBeLessThanOrEqual(16)
    expect(spentRefreshLedgerHas(ledger, 'first')).toBe(false)
    expect(spentRefreshLedgerHas(ledger, 'token-19')).toBe(true)
  })
})
