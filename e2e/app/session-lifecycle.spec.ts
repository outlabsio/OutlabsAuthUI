import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { markOAuthPending, openEmailForm, readOAuthPending } from '../support/sign-in'
import {
  apiBase,
  apiLogin,
  createSignedInUser,
  deleteTestUser,
  expiredVariant,
  fulfillJson,
  listUserSessions,
  newSessionContext,
  onPath,
  readStoredTokens,
  storeTokens,
  TEST_PASSWORD,
  type TestUser
} from '../support/session'
import { openUserMenuPage, signOutFromShell } from '../support/shell'

// Session lifecycle against a real backend: expiry, sign-out revocation, concurrent tabs,
// transient failures, OAuth callback hygiene and cache isolation between identities. Token
// expiry is simulated client-side (an expired, re-signed copy of the real access token), so no
// backend TTL change is needed. Every test uses its own disposable run-marked user whose sessions are
// minted without password logins where the backend allows it (see createSignedInUser), and
// server-side state is read through the admin API.

const signedIn = (page: Page, user: TestUser) => expect(page.getByText(user.email).first()).toBeVisible()

async function expireAccessToken(page: Page) {
  const { accessToken } = await readStoredTokens(page)
  await page.evaluate(token => localStorage.setItem('outlabs-auth.access-token', token), expiredVariant(accessToken!))
}

// True once some tab of the page's origin is queued behind the cross-tab refresh lock (Web
// Locks lists pending requests origin-wide), false if that does not happen in time.
async function waitForQueuedRefresh(page: Page, timeoutMs = 4_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const queued = await page.evaluate(async () => {
      const state = await navigator.locks.query()
      return (state.pending ?? []).some(lock => lock.name === 'outlabs-auth-refresh')
    }).catch(() => false)
    if (queued) return true
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  return false
}

// True when no tab of the page's origin holds or waits for the refresh lock.
const refreshLockIdle = (page: Page) => page.evaluate(async () => {
  const state = await navigator.locks.query()
  return ![...(state.held ?? []), ...(state.pending ?? [])].some(lock => lock.name === 'outlabs-auth-refresh')
})

// A flag on window, gone after any full page load: proves a flow stayed in one running app.
const markDocument = (page: Page) => page.evaluate(() => {
  (window as unknown as Record<string, unknown>).__sessionSpecDocument = true
})
const sameDocument = (page: Page) => page.evaluate(() => (window as unknown as Record<string, unknown>).__sessionSpecDocument === true)

test.describe('session lifecycle', () => {
  test.skip(!backendConfigured, 'Needs a seeded backend (E2E_API_BASE_URL).')

  let users: TestUser[] = []
  test.afterEach(async () => {
    await Promise.all(users.map(deleteTestUser))
    users = []
  })

  test('two tabs renew an expired token once, and sign-out after expiry revokes the session everywhere', async ({ browser }, testInfo) => {
    const { user, tokens } = await createSignedInUser('tabs')
    users.push(user)
    const [session] = await listUserSessions(user)
    expect(session).toBeTruthy()

    const context = await newSessionContext(browser, testInfo)
    let refreshCalls = 0
    context.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/auth/refresh')) refreshCalls++
    })
    const tabA = await context.newPage()
    const tabB = await context.newPage()
    await storeTokens(tabA, tokens)
    await Promise.all([tabA.goto('/app/dashboard'), tabB.goto('/app/dashboard')])
    await signedIn(tabA, user)
    await signedIn(tabB, user)

    // Force the race: the first renewal is held until the other tab, refused as well, is queued
    // behind the cross-tab refresh lock. Without the lock, that tab would present the same
    // refresh token while the rotation is in flight.
    let overlapped = false
    await context.route(/\/auth\/refresh$/, async (route) => {
      if (route.request().method() === 'POST' && !overlapped) overlapped = await waitForQueuedRefresh(tabA)
      await route.continue()
    })

    // Both tabs wake up with the same expired access token and reload at the same moment.
    await expireAccessToken(tabA)
    await Promise.all([tabA.reload(), tabB.reload()])
    await signedIn(tabA, user)
    await signedIn(tabB, user)
    await expect(tabA).toHaveURL(onPath('/app/dashboard'))
    await expect(tabB).toHaveURL(onPath('/app/dashboard'))
    expect(overlapped).toBe(true)
    await context.unroute(/\/auth\/refresh$/)

    // One rotation, shared by both tabs. Presenting the spent refresh token again would have
    // been refused as reuse (reuse_detected) and signed a tab out; instead exactly one
    // (rotated) session is live.
    expect(refreshCalls).toBe(1)
    const rotated = await readStoredTokens(tabB)
    expect(rotated.refreshToken).toBeTruthy()
    expect(rotated.refreshToken).not.toBe(tokens.refreshToken)
    const live = await listUserSessions(user)
    expect(live).toHaveLength(1)
    expect(live[0]!.id).not.toBe(session!.id)

    // Idle past the access-token lifetime again, then sign out in one tab.
    await expireAccessToken(tabA)
    await signOutFromShell(tabA)
    await expect(tabA).toHaveURL(/\/auth\/login/)
    expect(await readStoredTokens(tabA)).toEqual({ accessToken: undefined, refreshToken: undefined })

    // The other tab follows, with the reason and a way back.
    await expect(tabB).toHaveURL(/\/auth\/login\?reason=signed_out&redirect=(%2F|\/)app(%2F|\/)dashboard/)
    await expect(tabB.getByText('You signed out of this console in another tab.')).toBeVisible()

    // Server-side, the live (renewed) refresh token was revoked: no session remains.
    await expect.poll(async () => (await listUserSessions(user)).length, { timeout: 10_000 }).toBe(0)
    await context.close()
  })

  test('a sign-out queued behind another tab\'s renewal never replays the spent refresh token', async ({ browser }, testInfo) => {
    const { user, tokens } = await createSignedInUser('queued-out')
    users.push(user)
    const [browserSession] = await listUserSessions(user)
    // The same user on another device, which a sign-out here must leave alone.
    await apiLogin(user.email)
    const otherDevice = (await listUserSessions(user)).find(session => session.id !== browserSession!.id)
    expect(otherDevice).toBeTruthy()

    const context = await newSessionContext(browser, testInfo)
    let refreshCalls = 0
    let release!: () => void
    const released = new Promise<void>(resolve => (release = resolve))
    await context.route(/\/auth\/refresh$/, async (route) => {
      if (route.request().method() === 'POST' && ++refreshCalls === 1) await released
      await route.continue()
    })
    const tabA = await context.newPage()
    const tabB = await context.newPage()
    await storeTokens(tabA, tokens)
    await Promise.all([tabA.goto('/app/dashboard'), tabB.goto('/app/dashboard')])
    await signedIn(tabA, user)
    await signedIn(tabB, user)

    // Tab B renews an expired token; the renewal is held in flight.
    await expireAccessToken(tabA)
    const renewing = context.waitForEvent('request', request => request.method() === 'POST' && /\/auth\/refresh$/.test(request.url()))
    await openUserMenuPage(tabB, 'Account')
    await renewing
    // Tab A signs out meanwhile; its server-side revocation queues behind tab B's renewal.
    await signOutFromShell(tabA)
    await expect(tabA).toHaveURL(/\/auth\/login/)
    expect(await waitForQueuedRefresh(tabA)).toBe(true)
    release()

    // Tab B revokes the pair it minted (nobody can store it), and tab A does not present the
    // refresh token tab B already spent. Once both tabs are done with the lock: one renewal (a
    // replay would be a second one, answered as reuse), this browser's session is gone, and
    // the other device's session is untouched.
    await expect(tabB).toHaveURL(/\/auth\/login/)
    await expect.poll(() => refreshLockIdle(tabA)).toBe(true)
    expect(refreshCalls).toBe(1)
    await expect.poll(async () => (await listUserSessions(user)).map(session => session.id), { timeout: 10_000 }).toEqual([otherDevice!.id])
    await context.close()
  })

  test('a sign-in made elsewhere while this tab renews at boot is kept, not wiped', async ({ browser }, testInfo) => {
    const { user: stale, tokens: staleTokens } = await createSignedInUser('stale')
    const { user: newer, tokens: newerTokens } = await createSignedInUser('newer')
    users.push(stale, newer)

    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    // While the stale session's renewal is in flight, another tab signs in as someone else.
    await page.route(/\/auth\/refresh$/, async (route) => {
      if (route.request().method() === 'POST') {
        await page.evaluate(({ accessToken, refreshToken }) => {
          localStorage.setItem('outlabs-auth.access-token', accessToken)
          localStorage.setItem('outlabs-auth.refresh-token', refreshToken)
        }, newerTokens)
      }
      await route.continue()
    })
    await storeTokens(page, { ...staleTokens, accessToken: expiredVariant(staleTokens.accessToken) })
    await page.goto('/app/account')

    // The renewed stale pair belongs to no one (it is revoked); the newer sign-in is used.
    await expect(page).toHaveURL(onPath('/app/account'))
    await signedIn(page, newer)
    expect(await readStoredTokens(page)).toEqual(newerTokens)
    await expect.poll(async () => (await listUserSessions(stale)).length, { timeout: 10_000 }).toBe(0)
    await context.close()
  })

  test('a 502 while renewing keeps the session with a retry, and a wrong current password is never replayed', async ({ browser }, testInfo) => {
    const { user, tokens } = await createSignedInUser('retry')
    users.push(user)
    const expired = { ...tokens, accessToken: expiredVariant(tokens.accessToken) }

    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    await page.route(/\/auth\/refresh$/, route => fulfillJson(route, testInfo, 502, { message: 'Bad gateway' }))
    await storeTokens(page, expired)
    await page.goto('/app/account/security')

    await expect(page.getByRole('heading', { name: 'Can\'t reach the auth API' })).toBeVisible()
    await expect(page.getByText('answered HTTP 502 while loading your session')).toBeVisible()
    expect(await readStoredTokens(page)).toEqual(expired)

    // The API recovers: Retry renews the session and continues to the requested page.
    await page.unroute(/\/auth\/refresh$/)
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page).toHaveURL(onPath('/app/account/security'))
    await signedIn(page, user)

    // A wrong current password is a 401 answer: no renewal, no second submission.
    const before = await readStoredTokens(page)
    let refreshCalls = 0
    let changeCalls = 0
    page.on('request', (request) => {
      if (request.method() !== 'POST') return
      if (request.url().includes('/auth/refresh')) refreshCalls++
      if (request.url().includes('/users/me/change-password')) changeCalls++
    })
    await page.getByLabel('Current password').fill('Wrong-password-1!')
    await page.getByLabel('New password', { exact: true }).fill('Another-pass-2!')
    await page.getByLabel('Confirm new password').fill('Another-pass-2!')
    const answered = page.waitForResponse(r => r.url().includes('/users/me/change-password') && r.request().method() === 'POST')
    await page.getByRole('button', { name: 'Change password' }).click()
    expect((await answered).status()).toBe(401)
    // The answer is on the field it is about (F-097), which takes focus; the tab stays signed in.
    await expect(page.getByText('Current password is incorrect.', { exact: true })).toBeVisible()
    await expect(page.getByLabel('Current password')).toBeFocused()
    expect(changeCalls).toBe(1)
    expect(refreshCalls).toBe(0)
    await expect(page).toHaveURL(onPath('/app/account/security'))
    expect(await readStoredTokens(page)).toEqual(before)
    await context.close()
  })

  test('an API that never answers times out into the retry screen', async ({ browser }, testInfo) => {
    test.setTimeout(60_000)
    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    // Held forever: the console must not stay blank.
    await page.route(/\/users\/me$/, () => undefined)
    await storeTokens(page, { accessToken: 'opaque-access', refreshToken: 'opaque-refresh' })
    await page.goto('/app/dashboard')
    // The static loader covers the boot instead of a blank page...
    await expect(page.getByRole('status').filter({ hasText: 'Loading console' })).toBeVisible()
    // ...and the stalled request ends in an explanation with Retry, not an endless blank.
    await expect(page.getByRole('heading', { name: 'Can\'t reach the auth API' })).toBeVisible({ timeout: 25_000 })
    await expect(page.getByText('Loading console')).toHaveCount(0)
    await expect(page.getByText('did not respond within 15 seconds')).toBeVisible()
    expect((await readStoredTokens(page)).refreshToken).toBe('opaque-refresh')
    await context.close()
  })

  test('a boot answer that is not an outage says so, and the admin can sign out from it', async ({ browser }, testInfo) => {
    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    // A wrong base URL or auth prefix: the API answers, but not with a session.
    await page.route(/\/users\/me$/, route => fulfillJson(route, testInfo, 404, { detail: 'Not Found' }))
    await storeTokens(page, { accessToken: 'opaque-access', refreshToken: 'opaque-refresh' })
    await page.goto('/app/dashboard')

    await expect(page.getByRole('heading', { name: 'Can\'t load your session' })).toBeVisible()
    await expect(page.getByText('answered HTTP 404 while loading your session')).toBeVisible()
    await expect(page.getByText('usually temporary')).toHaveCount(0)
    expect((await readStoredTokens(page)).refreshToken).toBe('opaque-refresh')

    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page).toHaveURL(/\/auth\/login$/)
    await expect(page.getByRole('heading', { name: 'Can\'t load your session' })).toHaveCount(0)
    expect(await readStoredTokens(page)).toEqual({ accessToken: undefined, refreshToken: undefined })
    await context.close()
  })

  test('a boot retry that ends in a refused renewal explains why on the sign-in page', async ({ browser }, testInfo) => {
    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    await page.route(/\/auth\/refresh$/, route => fulfillJson(route, testInfo, 502, { message: 'Bad gateway' }))
    await storeTokens(page, { accessToken: 'opaque-access', refreshToken: 'opaque-refresh' })
    await page.goto('/app/roles')
    await expect(page.getByRole('heading', { name: 'Can\'t reach the auth API' })).toBeVisible()

    // The API is back, and the session turns out to have been revoked meanwhile.
    await page.unroute(/\/auth\/refresh$/)
    await page.route(/\/auth\/refresh$/, route => fulfillJson(route, testInfo, 401, {
      error: 'REFRESH_TOKEN_INVALID',
      message: 'Refresh token has been revoked',
      details: { reason: 'revoked', revoked_reason: 'User logout' }
    }))
    await page.getByRole('button', { name: 'Retry' }).click()
    await expect(page).toHaveURL(/\/auth\/login\?reason=revoked&redirect=(%2F|\/)app(%2F|\/)roles$/)
    await expect(page.getByText('You were signed out')).toBeVisible()
    expect(await readStoredTokens(page)).toEqual({ accessToken: undefined, refreshToken: undefined })
    await context.close()
  })

  test('the sign-in page explains an unreachable auth API and recovers on retry', async ({ browser }, testInfo) => {
    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    await page.route(/\/auth\/config$/, route => route.abort('failed'))
    await page.goto('/auth/login')
    const alert = page.getByRole('alert').filter({ hasText: 'Can\'t reach the auth API' })
    await expect(alert).toBeVisible()
    await expect(alert).toContainText(new URL(process.env.E2E_API_BASE_URL!).origin)
    await expect(alert).toContainText('CORS')

    await page.unroute(/\/auth\/config$/)
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(alert).toHaveCount(0)
    await context.close()
  })

  test('the OAuth callback strips tokens from the URL even when sign-in fails', async ({ browser }, testInfo) => {
    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    // This tab left for the provider (the marker the sign-in page writes), so the callback tries the session.
    await page.goto('/auth/login')
    await markOAuthPending(page)
    await page.goto('/auth/oauth/callback#access_token=not-a-token&refresh_token=not-a-token&token_type=bearer')
    await expect(page.getByRole('heading', { name: 'Sign-in failed' })).toBeVisible()
    await expect(page.getByText('The provider returned a session this console could not use.')).toBeVisible()
    expect(page.url()).not.toContain('#')
    expect(page.url()).not.toContain('not-a-token')
    expect(await readStoredTokens(page)).toEqual({ accessToken: undefined, refreshToken: undefined })
    await context.close()
  })

  test('an OAuth sign-in returns to the page it started from', async ({ browser }, testInfo) => {
    const { user, tokens } = await createSignedInUser('oauth-return')
    users.push(user)

    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    // What the sign-in page parks before leaving for the provider (the destination and the
    // pending marker), then the provider's return.
    await page.goto('/auth/login?redirect=/app/account')
    await page.evaluate(() => sessionStorage.setItem('outlabs-auth.post-sign-in-redirect', '/app/account'))
    await markOAuthPending(page)
    await page.goto(`/auth/oauth/callback#access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}&token_type=bearer`)
    await expect(page).toHaveURL(onPath('/app/account'))
    await signedIn(page, user)
    expect(page.url()).not.toContain(tokens.accessToken)
    // The marker is one-time.
    expect(await readOAuthPending(page)).toBeNull()
    await context.close()
  })

  test('an OAuth callback this tab did not start signs nothing in and revokes the session it carried', async ({ browser }, testInfo) => {
    // Login CSRF: someone mints a session for their own account and sends a signed-out admin
    // the callback link carrying it.
    const { user, tokens } = await createSignedInUser('oauth-unsolicited')
    users.push(user)

    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    const identityChecks: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('/users/me')) identityChecks.push(request.url())
    })
    const logout = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/auth/logout'))
    await page.goto(`/auth/oauth/callback#access_token=${tokens.accessToken}&refresh_token=${tokens.refreshToken}&token_type=bearer`)

    await expect(page.getByRole('heading', { name: 'Sign-in failed' })).toBeVisible()
    await expect(page.getByText('This sign-in was not started in this tab')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', '/auth/login')
    expect(page.url()).not.toContain('#')
    expect(page.url()).not.toContain(tokens.accessToken)
    expect(await readStoredTokens(page)).toEqual({ accessToken: undefined, refreshToken: undefined })
    // Nothing was asked of the API as that identity.
    expect(identityChecks).toEqual([])

    // The carried session is revoked server-side: its refresh token no longer renews.
    expect((await logout).ok()).toBe(true)
    const renewed = await fetch(`${apiBase}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refreshToken })
    })
    expect(renewed.status).toBe(401)

    // Opening the app still asks for sign-in.
    await page.goto('/app/dashboard')
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/)
    await context.close()
  })

  test('an OAuth callback is refused once its sign-in marker is too old', async ({ browser }, testInfo) => {
    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    await page.goto('/auth/login')
    // Older than the 15 to 30 minute window a provider round trip gets.
    await markOAuthPending(page, { ageMs: 31 * 60 * 1000 })
    await page.goto('/auth/oauth/callback#access_token=not-a-token&refresh_token=not-a-token&token_type=bearer')
    await expect(page.getByText('This sign-in was not started in this tab, or took too long to finish')).toBeVisible()
    expect(await readStoredTokens(page)).toEqual({ accessToken: undefined, refreshToken: undefined })
    expect(await readOAuthPending(page)).toBeNull()
    await context.close()
  })

  test('the next admin in the same running app sees none of the previous admin\'s cached rows', async ({ browser }, testInfo) => {
    const { user: first, tokens } = await createSignedInUser('cache-a', { superuser: true })
    const { user: second, tokens: secondTokens } = await createSignedInUser('cache-b', { superuser: true })
    users.push(first, second)

    const context = await newSessionContext(browser, testInfo)
    const page = await context.newPage()
    await storeTokens(page, tokens)
    await page.goto('/app/users')
    await signedIn(page, first)
    const firstEmailCell = page.locator('tbody tr').first().locator('td').first()
    await expect(firstEmailCell).toContainText('@')
    const cachedEmail = (await firstEmailCell.innerText()).trim()

    // From here on everything is in-app navigation: a page load would drop the in-memory query
    // cache and make this check meaningless, so the flow proves it stayed in one document.
    await markDocument(page)
    await signOutFromShell(page)
    await expect(page).toHaveURL(/\/auth\/login/)

    // The next admin signs in with the form. The login answer is that admin's real minted
    // pair, so the backend's password-login limiter is not spent; everything after it is real.
    await page.route(`${apiBase}/auth/login`, route => fulfillJson(route, testInfo, 200, {
      access_token: secondTokens.accessToken,
      refresh_token: secondTokens.refreshToken,
      token_type: 'bearer'
    }))
    await openEmailForm(page)
    await page.getByLabel('Email').fill(second.email)
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD)
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(onPath('/app/dashboard'))
    await signedIn(page, second)

    // Hold the second admin's users requests: nothing cached may render meanwhile. Cached rows
    // would render as soon as the page mounts, so the check follows the page heading.
    let release!: () => void
    const released = new Promise<void>(resolve => (release = resolve))
    let listRequests = 0
    await page.route(/\/users\/\?/, async (route) => {
      if (route.request().method() === 'GET') {
        listRequests++
        await released
      }
      await route.continue()
    })
    await page.getByRole('link', { name: 'Users', exact: true }).click()
    await expect(page).toHaveURL(onPath('/app/users'))
    await expect(page.getByRole('heading', { name: 'Users' }).first()).toBeVisible()
    await expect(page.locator('table').getByText(cachedEmail, { exact: true })).toHaveCount(0)
    expect(await sameDocument(page)).toBe(true)
    // The list is fetched for the new identity, not served from memory.
    await expect.poll(() => listRequests).toBeGreaterThan(0)

    release()
    await expect(page.locator('tbody tr').first().locator('td').first()).toContainText('@')
    expect(await sameDocument(page)).toBe(true)
    await context.close()
  })
})
