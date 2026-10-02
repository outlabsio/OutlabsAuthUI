import { describe, expect, it } from 'vitest'
import { errorPageCopy, errorPageTitle, normalizeErrorStatus } from '../../app/utils/error-page'

describe('error page copy', () => {
  it('names a 404 as not found, without a reload action', () => {
    expect(errorPageCopy(404)).toMatchObject({ statusCode: 404, title: 'Page not found', retryable: false })
    expect(errorPageTitle(404)).toBe('404 · Page not found')
  })

  it('does not call authorization or server failures "not found"', () => {
    expect(errorPageCopy(403).title).toBe('Access denied')
    expect(errorPageCopy(500)).toMatchObject({ title: 'Something went wrong', retryable: true })
    expect(errorPageCopy(503)).toMatchObject({ title: 'Service unavailable', retryable: true })
    expect(errorPageTitle(500)).toBe('500 · Something went wrong')
  })

  it('falls back by status class for unlisted codes', () => {
    expect(errorPageCopy(418)).toMatchObject({ statusCode: 418, title: 'Request failed', retryable: false })
    expect(errorPageCopy(599)).toMatchObject({ statusCode: 599, title: 'Something went wrong' })
  })

  it('treats missing or nonsensical statuses as an unexpected failure', () => {
    expect(normalizeErrorStatus(undefined)).toBe(500)
    expect(normalizeErrorStatus(200)).toBe(500)
    expect(normalizeErrorStatus('404')).toBe(404)
    expect(normalizeErrorStatus(Number.NaN)).toBe(500)
    expect(errorPageCopy(undefined).title).toBe('Something went wrong')
  })
})
