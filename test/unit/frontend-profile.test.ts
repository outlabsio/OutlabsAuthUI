import { describe, expect, it } from 'vitest'
import { isWrongApplicationError, wrongApplicationMessage } from '../../app/utils/frontend-profile'

describe('frontend profile rejection', () => {
  it('recognizes the backend 403 wrong_application shapes', () => {
    // outlabsAuth error envelope (what the login route returns).
    expect(isWrongApplicationError({
      status: 403,
      data: { error: 'HTTP_ERROR', message: 'no', details: { code: 'wrong_application', message: 'no' } }
    })).toBe(true)
    expect(isWrongApplicationError({ status: 403, data: { detail: { code: 'wrong_application', message: 'no' } } })).toBe(true)
    expect(isWrongApplicationError({ status: 403, data: { code: 'wrong_application' } })).toBe(true)
  })

  it('ignores other failures', () => {
    expect(isWrongApplicationError({ status: 401, data: { detail: { code: 'wrong_application' } } })).toBe(false)
    expect(isWrongApplicationError({ status: 403, data: { detail: 'Forbidden' } })).toBe(false)
    expect(isWrongApplicationError({ status: 403, data: null })).toBe(false)
    expect(isWrongApplicationError(new Error('network'))).toBe(false)
    expect(isWrongApplicationError(undefined)).toBe(false)
  })

  it('names the configured key when there is one', () => {
    expect(wrongApplicationMessage('console')).toContain('frontend profile "console"')
    expect(wrongApplicationMessage('console')).toContain('frontendProfileKey in app-config.json')
    expect(wrongApplicationMessage(undefined)).not.toContain('"')
  })
})
