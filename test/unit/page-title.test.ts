import { describe, expect, it } from 'vitest'
import { APP_SECTIONS } from '../../app/utils/capabilities'
import { composePageTitle, DEFAULT_APP_NAME, formatDocumentTitle, routeFallbackTitle } from '../../app/utils/page-title'
import { themeColorFor } from '../../app/utils/theme-color'

describe('routeFallbackTitle', () => {
  it('titles console routes from their section (list and detail)', () => {
    expect(routeFallbackTitle('/app/users')).toBe('Users')
    expect(routeFallbackTitle('/app/users/2473c83d')).toBe('Users')
    expect(routeFallbackTitle('/app/service-accounts')).toBe('Service accounts')
    expect(routeFallbackTitle('/app/service-accounts/0b9c1d1e-1111-4222-8333-444455556666')).toBe('Service accounts')
    // The personal keys page is titled as the user menu names it.
    expect(routeFallbackTitle('/app/api-keys')).toBe('My API keys')
    expect(routeFallbackTitle('/app/entities?entity=abc')).toBe('Entities')
  })

  it('gives every section a distinct title', () => {
    const titles = APP_SECTIONS.map(section => routeFallbackTitle(section.to))
    expect(titles.every(Boolean)).toBe(true)
    expect(new Set(titles).size).toBe(APP_SECTIONS.length)
  })

  it('titles guest pages', () => {
    expect(routeFallbackTitle('/auth/login')).toBe('Sign in')
    expect(routeFallbackTitle('/auth/login?reason=expired&redirect=/app/users')).toBe('Sign in')
    expect(routeFallbackTitle('/auth/signup/')).toBe('Create your account')
    expect(routeFallbackTitle('/auth/reset-password')).toBe('Choose a new password')
  })

  it('has no title for unknown routes (the app name alone)', () => {
    expect(routeFallbackTitle('/nowhere')).toBeUndefined()
    expect(routeFallbackTitle('/app')).toBeUndefined()
  })
})

describe('composePageTitle', () => {
  it('prefixes the record to its section', () => {
    expect(composePageTitle('admin@acme.com', 'Users')).toBe('admin@acme.com · Users')
  })

  it('falls back to the section while the record loads', () => {
    expect(composePageTitle(undefined, 'Users')).toBe('Users')
    expect(composePageTitle('  ', 'Users')).toBe('Users')
  })

  it('does not repeat a record named like its section', () => {
    expect(composePageTitle('Users', 'Users')).toBe('Users')
    expect(composePageTitle('Custom page', undefined)).toBe('Custom page')
    expect(composePageTitle(null, null)).toBeUndefined()
  })
})

describe('formatDocumentTitle', () => {
  it('appends the app name', () => {
    expect(formatDocumentTitle('Users', 'Acme Console')).toBe('Users · Acme Console')
    expect(formatDocumentTitle('admin@acme.com · Users', 'Acme Console')).toBe('admin@acme.com · Users · Acme Console')
  })

  it('is the app name alone without a page title', () => {
    expect(formatDocumentTitle(undefined, 'Acme Console')).toBe('Acme Console')
    expect(formatDocumentTitle('', 'Acme Console')).toBe('Acme Console')
    expect(formatDocumentTitle('Acme Console', 'Acme Console')).toBe('Acme Console')
  })

  it('uses the default app name when none is configured', () => {
    expect(formatDocumentTitle('Users', null)).toBe(`Users · ${DEFAULT_APP_NAME}`)
    expect(formatDocumentTitle(null, ' ')).toBe(DEFAULT_APP_NAME)
  })
})

describe('themeColorFor', () => {
  it('is white in light mode and the neutral 900 shade in dark mode', () => {
    expect(themeColorFor('light', 'zinc')).toBe('#ffffff')
    expect(themeColorFor('dark', 'zinc')).toBe('#18181b')
    expect(themeColorFor('dark', 'slate')).toBe('#0f172b')
  })

  it('falls back to zinc for an unknown neutral', () => {
    expect(themeColorFor('dark', 'custom')).toBe('#18181b')
    expect(themeColorFor('dark', undefined)).toBe('#18181b')
  })
})
