import { readFileSync } from 'node:fs'
import { backendConfigured, expect, persona, personaState, test } from '../support/fixtures'
import { openEmailForm } from '../support/sign-in'
import { fulfillJson, onPath, readStoredTokens, storeTokens, type Tokens } from '../support/session'

// Token-refresh + expiry handling with the refresh endpoint mocked, so the shared admin
// session is never rotated or revoked. A mid-session 401 on the users list (leaving the real
// boot calls untouched) drives the client's renewal; the mocked refresh answers decide
// between replay, forced sign-out and a kept session. Authenticated (chromium) project.

// The shared admin session minted by globalSetup (read, never rotated).
function adminTokens(): Tokens {
  const state = JSON.parse(readFileSync(personaState('admin'), 'utf8')) as {
    origins?: Array<{ localStorage?: Array<{ name: string, value: string }> }>
  }
  const items = state.origins?.flatMap(origin => origin.localStorage ?? []) ?? []
  const read = (name: string) => items.find(item => item.name === name)?.value ?? ''
  return { accessToken: read('outlabs-auth.access-token'), refreshToken: read('outlabs-auth.refresh-token') }
}

const usersList = /\/v1\/users\/\?/
const refresh = /\/v1\/auth\/refresh$/

test.describe('session refresh', () => {
  test.skip(!backendConfigured, 'Needs a seeded backend (E2E_API_BASE_URL).')

  test('a mid-session 401 refreshes the token once and retries transparently', async ({ page, errorGuard }, testInfo) => {
    // The mocked expired-token answer under test.
    errorGuard.allow({ status: 401, url: /\/users\/\?/ })
    let listCalls = 0
    let refreshCalls = 0
    const tokens = adminTokens()

    await page.route(usersList, async (route) => {
      if (route.request().method() === 'OPTIONS') return fulfillJson(route, testInfo, 204, null)
      listCalls++
      if (listCalls === 1) return fulfillJson(route, testInfo, 401, { detail: 'token expired' })
      return fulfillJson(route, testInfo, 200, {
        items: [{ id: 'u1', email: 'after-refresh@example.com', status: 'active', email_verified: true, is_superuser: false }],
        total: 1
      })
    })
    // Hand back the same (still valid) pair so the rest of the page keeps talking to the API.
    await page.route(refresh, async (route) => {
      if (route.request().method() !== 'OPTIONS') refreshCalls++
      return fulfillJson(route, testInfo, 200, { access_token: tokens.accessToken, refresh_token: tokens.refreshToken, token_type: 'bearer' })
    })

    await page.goto('/app/users')

    // The retry (after refresh) renders the mocked row — proving the refresh was transparent.
    await expect(page.getByText('after-refresh@example.com')).toBeVisible()
    expect(refreshCalls).toBe(1)
    expect(listCalls).toBe(2)
  })

  test('a refused refresh ends the session on sign-in with the reason and a way back', async ({ page, errorGuard }, testInfo) => {
    // The mocked 401 and the refused renewal under test.
    errorGuard.allow({ status: 401, url: /\/(users\/\?|auth\/refresh$)/ })
    await page.route(usersList, route => fulfillJson(route, testInfo, 401, { detail: 'token expired' }))
    await page.route(refresh, route => fulfillJson(route, testInfo, 401, {
      error: 'REFRESH_TOKEN_INVALID',
      message: 'Refresh token reuse detected; all sessions were revoked',
      details: { reason: 'reuse_detected' }
    }))

    await page.goto('/app/users')
    await expect(page).toHaveURL(/\/auth\/login\?reason=reuse_detected&redirect=(%2F|\/)app(%2F|\/)users$/)
    await expect(page.getByText('All sessions were signed out')).toBeVisible()
    expect(await readStoredTokens(page)).toEqual({ accessToken: undefined, refreshToken: undefined })

    // Signing back in returns to the page the admin was on. The sign-in answers with the shared
    // admin pair (still valid, never rotated here): this checks the way back, not the password
    // login, which the guest sign-in specs cover, so it spends none of the backend's login limit.
    await page.unroute(usersList)
    await page.unroute(refresh)
    const tokens = adminTokens()
    const login = /\/v1\/auth\/login$/
    let loginCalls = 0
    await page.route(login, (route) => {
      if (route.request().method() !== 'OPTIONS') loginCalls++
      return fulfillJson(route, testInfo, 200, { access_token: tokens.accessToken, refresh_token: tokens.refreshToken, token_type: 'bearer' })
    })
    await openEmailForm(page)
    const admin = persona('admin')
    await page.getByLabel('Email').fill(admin.email)
    await page.getByLabel('Password', { exact: true }).fill(admin.password)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(onPath('/app/users'))
    expect(loginCalls).toBe(1)
  })

  test('a session refused during boot lands on sign-in with the reason', async ({ page, errorGuard }, testInfo) => {
    // The refused session under test.
    errorGuard.allow({ status: 401, url: /\/(users\/me|auth\/refresh)$/ })
    await page.route(refresh, route => fulfillJson(route, testInfo, 401, {
      error: 'REFRESH_TOKEN_INVALID',
      message: 'Refresh token has expired',
      details: { reason: 'expired' }
    }))
    await storeTokens(page, { accessToken: 'stale-access', refreshToken: 'stale-refresh' })
    await page.goto('/app/roles')
    await expect(page).toHaveURL(/\/auth\/login\?reason=expired&redirect=(%2F|\/)app(%2F|\/)roles$/)
    await expect(page.getByText('Your session expired')).toBeVisible()
  })

  test('a 503 while renewing keeps the session and explains the retry', async ({ page, errorGuard }, testInfo) => {
    // The mocked 401 and the failing renewal under test.
    errorGuard.allow({ status: [401, 503], url: /\/(users\/\?|auth\/refresh$)/ })
    const before = adminTokens()
    await page.route(usersList, route => fulfillJson(route, testInfo, 401, { detail: 'token expired' }))
    await page.route(refresh, route => fulfillJson(route, testInfo, 503, { message: 'Service unavailable' }))

    await page.goto('/app/users')
    await expect(page.getByText('could not renew your session (HTTP 503). You are still signed in').first()).toBeVisible()
    await expect(page).toHaveURL(onPath('/app/users'))
    expect(await readStoredTokens(page)).toEqual(before)
  })
})
