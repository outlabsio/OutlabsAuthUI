import { describe, expect, it } from 'vitest'
import {
  ApiError,
  apiFormErrors,
  formFieldFor,
  cleanValidationMessage,
  describeAuthError,
  getApiErrorMessage,
  getApiErrorMessageFromPayload,
  humanizeFieldPath,
  normalizeApiError,
  parseRetryAfterHeader
} from '~/api/errors'
import { ApiError as ClientApiError } from '~/api/client'

// The error model shapes every toast, dialog alert and "Could not load" message. The backend
// answers in three envelopes — FastAPI's `detail`, the library's `{ error, message, details }`
// (including VALIDATION_ERROR with details.errors[]) and no JSON at all — and every one must
// classify correctly and read as a human sentence.

function apiError(status: number, data: Record<string, unknown> | null, extra: Partial<ConstructorParameters<typeof ApiError>[0]> = {}) {
  return new ApiError({ message: 'Request failed', status, statusText: '', data, ...extra })
}

describe('ApiError', () => {
  it('is the same class the client throws (re-exported)', () => {
    expect(ClientApiError).toBe(ApiError)
  })

  it('treats errors with a payload as API answers and the rest as console-written', () => {
    expect(apiError(400, { detail: 'x' }).source).toBe('response')
    expect(apiError(503, null).source).toBe('client')
    expect(apiError(503, null, { source: 'response' }).source).toBe('response')
  })
})

describe('getApiErrorMessageFromPayload', () => {
  it.each([
    ['FastAPI string detail', { detail: 'User not found' }, 'User not found'],
    ['library envelope message', { error: 'HTTP_ERROR', message: 'Role is in use', details: { detail: 'Role is in use' } }, 'Role is in use'],
    ['nested details.detail', { details: { detail: 'Nested reason' } }, 'Nested reason'],
    ['422 validation array', { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email address' }] }, 'email: Value is not a valid email address'],
    ['validation errors under details', { details: { errors: [{ loc: ['body', 'name'], message: 'Too short' }] } }, 'name: Too short']
  ])('reads %s', (_label, payload, expected) => {
    expect(getApiErrorMessageFromPayload(payload)).toBe(expected)
  })

  it('returns null when nothing readable is present', () => {
    expect(getApiErrorMessageFromPayload(null)).toBeNull()
    expect(getApiErrorMessageFromPayload({ detail: [] })).toBeNull()
    expect(getApiErrorMessageFromPayload({ detail: '   ' })).toBeNull()
  })
})

describe('normalizeApiError: classification', () => {
  it.each([
    [400, 'validation'],
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'not_found'],
    [408, 'timeout'],
    [409, 'conflict'],
    [410, 'not_found'],
    [413, 'validation'],
    [422, 'validation'],
    [429, 'rate_limited'],
    [500, 'server'],
    [503, 'server'],
    [418, 'unknown']
  ] as const)('HTTP %i is %s', (status, kind) => {
    expect(normalizeApiError(apiError(status, { message: 'x' })).kind).toBe(kind)
  })

  it('lets a stable code override the status', () => {
    expect(normalizeApiError(apiError(400, { error: 'MEMBERSHIP_ALREADY_EXISTS', message: 'Already a member' })).kind).toBe('conflict')
    expect(normalizeApiError(apiError(403, { error: 'ROLE_NOT_FOUND', message: 'Role not found' })).kind).toBe('not_found')
  })

  it('classifies transport failures and ended sessions', () => {
    const network = normalizeApiError(new ApiError({ kind: 'network', status: 0, statusText: '', data: null, message: 'Can\'t reach the auth API at https://api.example.com.' }))
    expect(network).toMatchObject({ kind: 'network', status: 0, transient: true, message: 'Can\'t reach the auth API at https://api.example.com.' })
    const timeout = normalizeApiError(new ApiError({ kind: 'timeout', status: 0, statusText: '', data: null, message: 'No answer in 15 seconds.' }))
    expect(timeout).toMatchObject({ kind: 'timeout', transient: true })
    const ended = normalizeApiError(new ApiError({ kind: 'session_ended', status: 401, statusText: '', data: { error: 'REFRESH_TOKEN_INVALID' }, message: 'Your session has ended.' }))
    expect(ended).toMatchObject({ kind: 'unauthorized', sessionEnded: true })
  })

  it('keeps a message the console wrote itself', () => {
    const renewal = apiError(503, null, { message: 'The auth API could not renew your session (HTTP 503). You are still signed in; try again in a moment.' })
    expect(normalizeApiError(renewal)).toMatchObject({ kind: 'server', transient: true, message: renewal.message })
  })

  it('treats anything that is not an ApiError as unknown', () => {
    const normalized = normalizeApiError(new TypeError('boom'))
    expect(normalized).toMatchObject({ kind: 'unknown', status: 0, generic: true })
    expect(normalized.message).toMatch(/Something went wrong/)
  })
})

describe('normalizeApiError: codes and details', () => {
  it('prefers the library code, and a nested code under a generic HTTP_ERROR', () => {
    expect(normalizeApiError(apiError(403, { error: 'PERMISSION_DENIED', message: 'x', details: {} })).code).toBe('PERMISSION_DENIED')
    expect(normalizeApiError(apiError(403, { error: 'HTTP_ERROR', message: 'x', details: { code: 'wrong_application' } })).code).toBe('wrong_application')
    expect(normalizeApiError(apiError(403, { detail: { code: 'wrong_application', message: 'x' } })).code).toBe('wrong_application')
    expect(normalizeApiError(apiError(400, { detail: 'plain' })).code).toBeNull()
  })

  it('names the permissions a delegation denial is missing', () => {
    const normalized = normalizeApiError(apiError(403, {
      error: 'PERMISSION_DENIED',
      message: 'You cannot grant permissions you do not hold',
      details: { missing_permissions: ['role:update', 'user:delete'] }
    }))
    expect(normalized.kind).toBe('forbidden')
    expect(normalized.missingPermissions).toEqual(['role:update', 'user:delete'])
    expect(normalized.message).toBe('You cannot grant permissions you do not hold. Missing: role:update, user:delete.')
  })

  it('reads missing permissions from a bare FastAPI detail object too', () => {
    const normalized = normalizeApiError(apiError(403, { detail: { message: 'Denied', missing_permissions: ['entity:create'] } }))
    expect(normalized.missingPermissions).toEqual(['entity:create'])
  })

  it('turns an any-of requirement into a list instead of a Python repr', () => {
    const normalized = normalizeApiError(apiError(403, {
      error: 'PERMISSION_DENIED',
      message: 'Permission denied: requires one of [\'user:read\', \'user:read_tree\']',
      details: { required_permissions: ['user:read', 'user:read_tree'] }
    }))
    expect(normalized.requiredPermissions).toEqual(['user:read', 'user:read_tree'])
    expect(normalized.message).toBe('You need one of these permissions: user:read, user:read_tree.')
  })

  it('replaces a generic route denial with copy that says permissions were refreshed', () => {
    const normalized = normalizeApiError(apiError(403, { error: 'HTTP_ERROR', message: 'Insufficient permissions', details: { detail: 'Insufficient permissions' } }))
    expect(normalized.generic).toBe(true)
    expect(normalized.message).toMatch(/don't have permission/)
  })

  it('reads the cooldown from the body, then from the Retry-After header', () => {
    expect(normalizeApiError(apiError(429, { error: 'RATE_LIMIT_EXCEEDED', details: { retry_after_seconds: 42.2 } }))).toMatchObject({
      kind: 'rate_limited',
      retryAfterSeconds: 43,
      message: 'Too many requests. Try again in 43 seconds.'
    })
    expect(normalizeApiError(apiError(429, { detail: { message: 'Slow down', retry_after_seconds: 1 } })).message).toBe('Too many requests. Try again in 1 second.')
    expect(normalizeApiError(apiError(429, null, { source: 'response', retryAfterSeconds: 9 })).retryAfterSeconds).toBe(9)
    expect(normalizeApiError(apiError(429, null, { source: 'response' })).message).toBe('Too many requests. Try again shortly.')
  })
})

describe('normalizeApiError: validation issues', () => {
  it('collects every FastAPI detail[] issue with field paths and clean messages', () => {
    const normalized = normalizeApiError(apiError(422, {
      detail: [
        { type: 'value_error', loc: ['body', 'email'], msg: 'value is not a valid email address' },
        { type: 'value_error', loc: ['body', 'password'], msg: 'Value error, Password must contain a digit' },
        { type: 'missing', loc: ['body', 'role_ids', 0], msg: 'Field required' }
      ]
    }))
    expect(normalized.kind).toBe('validation')
    expect(normalized.issues).toEqual([
      { path: 'email', label: 'Email', message: 'Value is not a valid email address' },
      { path: 'password', label: 'Password', message: 'Password must contain a digit' },
      { path: 'role_ids.0', label: 'Role IDs #1', message: 'This field is required' }
    ])
    expect(normalized.fieldErrors).toEqual({
      'email': 'Value is not a valid email address',
      'password': 'Password must contain a digit',
      'role_ids.0': 'This field is required'
    })
    expect(normalized.message).toBe('Email: Value is not a valid email address. Password: Password must contain a digit. Role IDs #1: This field is required.')
  })

  it('reads the library VALIDATION_ERROR envelope (details.errors) and query parameters', () => {
    const normalized = normalizeApiError(apiError(422, {
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: {
        errors: [
          { type: 'uuid_parsing', loc: ['query', 'subject_user_id'], msg: 'Input should be a valid UUID, invalid length' },
          { type: 'uuid_parsing', loc: ['query', 'actor_user_id'], msg: 'Input should be a valid UUID, invalid length' }
        ]
      }
    }))
    expect(normalized.issues.map(i => i.label)).toEqual(['Subject user ID', 'Actor user ID'])
    expect(normalized.message).not.toMatch(/Request validation failed/)
    expect(normalized.message).toMatch(/^Subject user ID: Input should be a valid UUID/)
  })

  it('maps library errors that name their field(s)', () => {
    const one = normalizeApiError(apiError(422, { error: 'INVALID_INPUT', message: 'Invalid phone number', details: { field: 'phone' } }))
    expect(one.issues).toEqual([{ path: 'phone', label: 'Phone', message: 'Invalid phone number' }])
    expect(one.message).toBe('Invalid phone number.')
    const many = normalizeApiError(apiError(400, { error: 'INVALID_INPUT', message: 'Provide an email or a phone', details: { fields: ['email', 'phone'] } }))
    expect(Object.keys(many.fieldErrors)).toEqual(['email', 'phone'])
  })

  it('maps codes that always concern one input', () => {
    const weak = normalizeApiError(apiError(400, { error: 'INVALID_PASSWORD', message: 'Password must contain at least one uppercase letter', details: { password_requirements: {} } }))
    expect(weak.fieldErrors).toEqual({ password: 'Password must contain at least one uppercase letter' })
    const duplicate = normalizeApiError(apiError(409, { error: 'USER_ALREADY_EXISTS', message: 'User with email a@example.com already exists', details: {} }))
    expect(duplicate.kind).toBe('conflict')
    expect(duplicate.fieldErrors).toEqual({ email: 'User with email a@example.com already exists' })
  })

  it('keeps a whole-body problem without a field', () => {
    const normalized = normalizeApiError(apiError(422, { detail: [{ loc: ['body'], msg: 'JSON decode error' }] }))
    expect(normalized.issues).toEqual([{ path: '', label: '', message: 'JSON decode error' }])
    expect(normalized.fieldErrors).toEqual({})
  })

  it('falls back to the business-rule message for a 400 without issues', () => {
    expect(normalizeApiError(apiError(400, { error: 'ENTITY_ERROR', message: 'Cannot move an entity under itself' })).message).toBe('Cannot move an entity under itself.')
  })
})

describe('normalizeApiError: copy', () => {
  it('replaces developer text for server failures and includes the status', () => {
    expect(normalizeApiError(apiError(500, { error: 'INTERNAL_SERVER_ERROR', message: 'Internal server error', details: {} })).message)
      .toBe('The auth API hit an unexpected error (HTTP 500). Try again; if it keeps happening, check the API logs.')
    expect(normalizeApiError(apiError(502, null, { source: 'response', statusText: 'Bad Gateway' })).message)
      .toBe('The auth API is temporarily unavailable (HTTP 502). Try again in a moment.')
    expect(normalizeApiError(apiError(503, { error: 'AUTH_INFRASTRUCTURE_UNAVAILABLE', message: 'Redis down' })).message)
      .toMatch(/^A service the auth API depends on is unavailable \(HTTP 503\)\. Try again in a moment\.$/)
  })

  it('explains a missing route as a version mismatch', () => {
    expect(normalizeApiError(apiError(404, { detail: 'Not Found' })).message).toMatch(/does not provide this endpoint \(HTTP 404\)/)
    expect(normalizeApiError(apiError(405, { detail: 'Method Not Allowed' })).message).toMatch(/HTTP 405/)
  })

  it('says a missing record may have been deleted', () => {
    expect(normalizeApiError(apiError(404, { error: 'USER_NOT_FOUND', message: 'User not found' })).message)
      .toBe('User not found. It may have been deleted, or you no longer have access to it.')
  })

  it('replaces an integrity violation', () => {
    expect(normalizeApiError(apiError(409, { error: 'INTEGRITY_ERROR', message: 'Integrity constraint violated', details: {} })).message)
      .toMatch(/conflicts with an existing record/)
  })
})

describe('getApiErrorMessage', () => {
  it('uses the normalized message for API errors', () => {
    expect(getApiErrorMessage(apiError(409, { detail: 'Email already registered' }))).toBe('Email already registered.')
  })

  it('falls back to the fallback for anything that is not an ApiError', () => {
    expect(getApiErrorMessage(new TypeError('Failed to fetch'), 'Network down')).toBe('Network down')
  })
})

describe('describeAuthError', () => {
  it('turns a 429 with retry_after_seconds into a cooldown message', () => {
    const described = describeAuthError(apiError(429, { error: 'RATE_LIMITED', details: { retry_after_seconds: 42.2 } }), 'Sign in failed')
    expect(described.title).toBe('Please wait a moment')
    expect(described.description).toMatch(/43 seconds/)
  })

  it('handles a 429 without a retry hint', () => {
    const described = describeAuthError(apiError(429, null, { source: 'response' }), 'Sign in failed')
    expect(described.description).toMatch(/try again/i)
  })

  it('keeps the caller title and the server message for other errors', () => {
    expect(describeAuthError(apiError(401, { detail: 'Invalid email or password.' }), 'Sign in failed'))
      .toEqual({ title: 'Sign in failed', description: 'Invalid email or password.' })
  })
})

describe('form mapping helpers', () => {
  const issues = [
    { path: 'email', label: 'Email', message: 'Taken' },
    { path: 'root_entity_id', label: 'Root entity ID', message: 'Not a root' },
    { path: 'metadata', label: 'Metadata', message: 'Too large' },
    { path: '', label: '', message: 'Body invalid' }
  ]

  it('renames wire paths, drops null-mapped ones and returns fieldless issues as unmatched', () => {
    const { fieldErrors, unmatched } = apiFormErrors({ issues }, { root_entity_id: 'rootEntityId', metadata: null })
    expect(fieldErrors).toEqual([{ name: 'email', message: 'Taken' }, { name: 'rootEntityId', message: 'Not a root' }])
    expect(unmatched.map(i => i.message)).toEqual(['Too large', 'Body invalid'])
  })

  it('maps a member of a union or list onto its field through the field\'s entry', () => {
    const members = [
      { path: 'value.str', label: 'Value › Str', message: 'Input should be a valid string' },
      { path: 'role_ids.0', label: 'Role IDs #1', message: 'Input should be a valid UUID' },
      { path: 'metadata.team', label: 'Metadata › Team', message: 'Too long' }
    ]
    const { fieldErrors, unmatched } = apiFormErrors({ issues: members }, { value: 'value', role_ids: 'roleIds', metadata: null })
    expect(fieldErrors).toEqual([
      { name: 'value', message: 'Input should be a valid string' },
      { name: 'roleIds', message: 'Input should be a valid UUID' }
    ])
    expect(unmatched.map(i => i.path)).toEqual(['metadata.team'])
    // Without an entry, the dotted path is the UForm name of a nested field.
    expect(formFieldFor('profile.email')).toBe('profile.email')
    expect(formFieldFor('profile.email', { 'profile.email': 'email' })).toBe('email')
    expect(formFieldFor('')).toBeNull()
  })

  it('humanizes field paths and cleans Pydantic prefixes', () => {
    expect(humanizeFieldPath('subject_user_id')).toBe('Subject user ID')
    expect(humanizeFieldPath('ip_whitelist.2')).toBe('IP whitelist #3')
    expect(humanizeFieldPath('metadata.displayName')).toBe('Metadata › Display name')
    expect(cleanValidationMessage('Value error, must be positive')).toBe('Must be positive')
    expect(cleanValidationMessage('Assertion failed, nope')).toBe('Nope')
  })

  it('parses Retry-After headers', () => {
    expect(parseRetryAfterHeader('30')).toBe(30)
    expect(parseRetryAfterHeader('0.2')).toBe(1)
    expect(parseRetryAfterHeader(new Date(Date.UTC(2026, 0, 1, 0, 0, 20)).toUTCString(), Date.UTC(2026, 0, 1))).toBe(20)
    expect(parseRetryAfterHeader('soon')).toBeNull()
    expect(parseRetryAfterHeader(null)).toBeNull()
  })
})
