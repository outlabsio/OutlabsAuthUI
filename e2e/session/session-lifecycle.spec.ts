import type { BrowserContext, Page, Response as ApiResponse, Route } from '@playwright/test'
import { TEST_PASSWORD } from '../support/api-client'
import { apiUrl } from '../support/env'
import { expect, test } from '../support/fixtures'
import {
  accessTokenStatus,
  expireAccessToken,
  mintAnotherSession,
  mintFreshSession,
  readSessionTokens,
  refreshTokenStatus,
  type SessionTokens
} from '../support/sessions'
import { signOutFromShell } from '../support/shell'

// Session-lifecycle lane (project `session`). The seeded example backends issue 8-hour access
// tokens, so an ordinary run never sees one expire; this lane expires the stored token
// client-side (expireAccessToken) and lets the console run its REAL refresh, rotation and
// logout against the real backend. Every test mints a fresh run-marked user's session
// (mintFreshSession) and owns it: rotating or revoking a shared persona session would break
// other tests.
//
// Scenarios: idle then mutate, idle then reload, idle then sign out, two tabs refreshing at
// once, idle then change the password, idle then sign out everywhere. The server-side outcome of
// every scenario is asserted through the API (refreshTokenStatus, accessTokenStatus, the admin's
// view of the user's sessions). Logout after expiry (F-005) and concurrent tabs (F-006) are
// active, and so are the tab after a password change (F-029: signed in again with the new
// password, or signed out with the reason when that fails) and the tab after "sign out
// everywhere" (F-030: signed out to sign-in with a notice).

test.use({ errorGuardMode: 'strict' })

const isRefresh = (url: string, method: string) => url === apiUrl('/auth/refresh') && method === 'POST'
const isChangePassword = (url: string, method: string) => url === apiUrl('/users/me/change-password') && method === 'POST'
const isRevokeAll = (url: string, method: string) => url === apiUrl('/users/me/sessions') && method === 'DELETE'

const NEW_PASSWORD = 'Pw-e2e-Changed0!'

async function changePasswordInAccount(page: Page, current: string, next: string) {
  if (!new URL(page.url()).pathname.endsWith('/app/account/security')) await page.goto('/app/account/security')
  await page.getByLabel('Current password', { exact: true }).fill(current)
  await page.getByLabel('New password', { exact: true }).fill(next)
  await page.getByLabel('Confirm new password', { exact: true }).fill(next)
  await page.getByRole('button', { name: 'Change password', exact: true }).click()
}

// The Sessions card's "end every session" control (F-030): it asks first, naming this browser
// among the sessions it ends, and only the confirmation sends the request.
async function signOutEverywhere(page: Page) {
  let sentEarly = false
  page.on('request', (request) => {
    if (isRevokeAll(request.url(), request.method())) sentEarly = true
  })
  await page.getByRole('button', { name: 'Sign out everywhere', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Sign out everywhere' })
  await expect(dialog.getByTestId('confirm-effects')).toContainText('This browser is signed out too')
  expect(sentEarly, 'nothing is revoked before the confirmation').toBe(false)
  const sent = page.waitForRequest(request => isRevokeAll(request.url(), request.method()))
  await dialog.getByRole('button', { name: 'Sign out everywhere' }).click()
  await sent
}

// What the tab is left holding: a working session, a clean sign-out, or a session the backend
// has already ended (the defect F-029 and F-030 describe).
async function tabSession(page: Page): Promise<'signed-in' | 'signed-out' | 'ended-but-kept'> {
  const { access } = await readSessionTokens(page)
  if (!access) return new URL(page.url()).pathname.startsWith('/auth/login') ? 'signed-out' : 'ended-but-kept'
  return (await accessTokenStatus(access)) === 200 ? 'signed-in' : 'ended-but-kept'
}

// A UPageCard by its heading.
function cardByHeading(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true }).locator('xpath=ancestor::*[@data-slot="root"][1]')
}

// The pair the console holds after its refresh (read from the refresh response, because a
// console that signs out afterwards clears localStorage).
async function heldAfterRefresh(refresh: Promise<ApiResponse>): Promise<SessionTokens> {
  const response = await refresh
  expect(response.status()).toBe(200)
  return await response.json() as SessionTokens
}

// A fresh context's first SPA boot can take a while on a cold dev server.
const BOOT = { timeout: 30_000 }

test.describe('session lifecycle (simulated expiry)', () => {
  test.beforeEach(async ({ requires, errorGuard }) => {
    await requires({ surfaces: ['users'] })
    // The forged token's first request is SUPPOSED to be rejected once; the refresh is the test.
    errorGuard.allow({ kind: 'api', status: 401 }, { kind: 'console', console: /status of 401/ })
    // F-043: icons are fetched from the Iconify API until they are bundled with the build.
    errorGuard.allow({ kind: 'third-party', url: /^https:\/\/api\.iconify\.design\// })
  })

  test('an idle tab refreshes once and completes its next mutation', async ({ api, sessionContext }) => {
    const { user, tokens } = await mintFreshSession(api)
    const page = await (await sessionContext(tokens)).newPage()

    await page.goto('/app/account')
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible(BOOT)
    await expireAccessToken(page)

    const refreshed = page.waitForResponse(r => isRefresh(r.url(), r.request().method()))
    await page.getByLabel('First name').fill('Refreshed')
    await page.getByRole('button', { name: 'Save profile' }).click()

    expect((await refreshed).status()).toBe(200)
    await expect(page.getByText('Profile updated', { exact: true })).toBeVisible()
    await expect.poll(async () => (await api.get<{ first_name?: string }>(`/users/${user.id}`)).first_name).toBe('Refreshed')
    // The refresh rotated the pair and the console kept the new one.
    const after = await readSessionTokens(page)
    expect(after.refresh).toBeTruthy()
    expect(after.refresh).not.toBe(tokens.refresh_token)
  })

  test('an idle tab survives a reload without bouncing to sign-in', async ({ api, sessionContext }) => {
    const { tokens } = await mintFreshSession(api)
    const page = await (await sessionContext(tokens)).newPage()

    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible(BOOT)
    await expireAccessToken(page)

    let refreshCalls = 0
    page.on('request', (request) => {
      if (isRefresh(request.url(), request.method())) refreshCalls++
    })
    await page.reload()

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page).toHaveURL(/\/app\/dashboard/)
    // Boot fans out /users/me and /permissions/me; both 401s share ONE refresh.
    expect(refreshCalls).toBe(1)
  })

  test('signing out after expiry ends the session on the server', async ({ api, sessionContext }) => {
    const { user, tokens } = await mintFreshSession(api)
    const page = await (await sessionContext(tokens)).newPage()

    await page.goto('/app/dashboard')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible(BOOT)
    await expireAccessToken(page)
    await signOutFromShell(page)
    await expect(page).toHaveURL(/\/auth\/login/)

    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(0)
  })

  test('two idle tabs refreshing at once both stay signed in', async ({ api, sessionContext }) => {
    const { user, tokens } = await mintFreshSession(api)
    const context = await sessionContext(tokens)
    const first = await context.newPage()
    const second = await context.newPage()
    await first.goto('/app/dashboard')
    await second.goto('/app/account')
    await expect(first.getByRole('heading', { name: 'Dashboard' })).toBeVisible(BOOT)
    await expect(second.getByRole('heading', { name: 'Profile' })).toBeVisible(BOOT)

    // localStorage is shared per origin: expiring the token in one tab makes the other tab
    // re-validate its session, and reloading this tab boots with the expired token. Any refresh
    // calls are held and released together, so they race exactly like tabs waking up after a
    // laptop sleep. The console serializes renewals across tabs (a tab waiting on the lock
    // reuses the rotation another tab made), so usually only one call reaches the network; a
    // lone call is released after 5 s.
    const held: Route[] = []
    let released = false
    const release = async () => {
      if (released) return
      released = true
      await Promise.all(held.map(route => route.continue()))
    }
    await context.route(apiUrl('/auth/refresh'), async (route) => {
      if (route.request().method() !== 'POST' || released) return route.continue()
      held.push(route)
      if (held.length === 2) await release()
      else setTimeout(() => void release(), 5_000)
    })
    await expireAccessToken(first)
    await first.reload()
    await expect.poll(() => held.length).toBeGreaterThanOrEqual(1)

    await expect(first.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(second.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBeGreaterThan(0)
  })

  test('changing the password after idling ends the old session; a failed sign-in again signs the tab out with the reason', async ({ api, sessionContext, errorGuard }) => {
    errorGuard.allow({ kind: 'api', status: 429 }, { kind: 'console', console: /status of 429/ })
    const { tokens } = await mintFreshSession(api)
    const context = await sessionContext(tokens)
    const page = await context.newPage()
    // Signing in again with the new password is refused, as a rate limit right after several
    // attempts would (and no password login is spent on the shared limiter).
    await context.route(apiUrl('/auth/login'), route => route.request().method() === 'POST'
      ? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ error: 'RATE_LIMIT_EXCEEDED', message: 'Too many login attempts', details: { retry_after_seconds: 60 } }) })
      : route.continue())

    await page.goto('/app/account/security')
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible(BOOT)
    await expireAccessToken(page)

    const refreshed = page.waitForResponse(r => isRefresh(r.url(), r.request().method()))
    // The expired token's attempt is rejected (401) and replayed after the refresh.
    const changed = page.waitForResponse(r => isChangePassword(r.url(), r.request().method()) && r.status() !== 401)
    await changePasswordInAccount(page, TEST_PASSWORD, NEW_PASSWORD)

    const held = await heldAfterRefresh(refreshed)
    expect((await changed).status()).toBeLessThan(300)
    // The backend ends every session on a password change: the pair the console held when it
    // made the change can no longer refresh, and its access token is rejected as issued before it.
    expect(await refreshTokenStatus(held.refresh_token)).toBe(401)
    expect(await accessTokenStatus(held.access_token)).toBe(401)

    // The console could not sign in again, so it signed the tab out and says why.
    await expect(page).toHaveURL(/\/auth\/login\?.*reason=password_changed/)
    await expect(page.getByText('Your password was changed', { exact: true })).toBeVisible()
    await expect.poll(() => tabSession(page)).toBe('signed-out')
  })

  // The console signs in again with the new password. Password logins share one small per-IP
  // limiter across the whole run, so the sign-in is answered with a session the backend mints for
  // the same user right then (after the change, so it is valid), without spending one where the
  // dev magic-link capture exists; the request itself is checked. `hold` keeps the answer until
  // the test lets it go.
  async function answerSignInAgain(context: BrowserContext, user: { email: string }, { hold = false } = {}) {
    let body: Record<string, unknown> | null = null
    let release!: () => void
    const released = hold ? new Promise<void>(resolve => (release = resolve)) : Promise.resolve()
    await context.route(apiUrl('/auth/login'), async (route) => {
      if (route.request().method() !== 'POST') return route.continue()
      body = route.request().postDataJSON() as Record<string, unknown>
      await released
      return route.fulfill({ json: await mintAnotherSession(user, NEW_PASSWORD) })
    })
    return { body: () => body, release: () => release?.() }
  }

  test('changing the password signs this tab in again, lists only this session and leaves a clean form', async ({ api, sessionContext }) => {
    const { user, tokens } = await mintFreshSession(api)
    const context = await sessionContext(tokens)
    const page = await context.newPage()
    const signIn = await answerSignInAgain(context, user)
    let refreshes = 0
    page.on('request', (request) => {
      if (isRefresh(request.url(), request.method())) refreshes++
    })
    // Fake timers that run in real time until paused (below).
    await page.clock.install()

    await page.goto('/app/account/security')
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible(BOOT)
    const sessions = cardByHeading(page, 'Active sessions')
    await expect(sessions.locator('tbody tr')).toHaveCount(1)
    const sessionReads: number[] = []
    page.on('response', (response) => {
      if (response.url() === apiUrl('/users/me/sessions') && response.request().method() === 'GET') sessionReads.push(response.status())
    })

    // A password manager fills the three fields and submits at once, so the change completes
    // before the form's 300 ms validate-on-input delay has passed for them. Time stands still
    // from here (network answers still arrive) until the test runs those pending validations.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000))
    const changed = page.waitForResponse(r => isChangePassword(r.url(), r.request().method()))
    await changePasswordInAccount(page, TEST_PASSWORD, NEW_PASSWORD)
    expect((await changed).status()).toBeLessThan(300)
    await expect.poll(() => signIn.body()).toMatchObject({ email: user.email, password: NEW_PASSWORD })

    await expect(page.getByText('Password changed', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Your other devices were signed out. You are still signed in here.').first()).toBeVisible()
    await expect(page).toHaveURL(/\/app\/account\/security$/)
    // The tab is signed in again without a reload or a remount, and the sessions card on screen
    // is read again with the new session: one row, this browser's (the session the change ended
    // is gone). It never stays on its loading state.
    await expect.poll(() => sessionReads).toContain(200)
    await expect(sessions.locator('tbody tr')).toHaveCount(1)
    await expect(sessions.locator('tbody tr').first().getByText('This browser', { exact: true })).toBeVisible()

    // The form is empty and stays free of errors once its pending input validations have run.
    const form = cardByHeading(page, 'Change password')
    for (const label of ['Current password', 'New password', 'Confirm new password']) {
      await expect(form.getByLabel(label, { exact: true })).toHaveValue('')
    }
    await page.clock.runFor(1_000)
    await page.clock.resume()
    await expect(form.getByText('Enter your current password.', { exact: true })).toHaveCount(0)
    await expect(form.getByText(/^Password must be at least/)).toHaveCount(0)
    await expect(form.locator('[aria-invalid="true"]')).toHaveCount(0)

    expect(refreshes, 'nothing presented the refresh token the change revoked').toBe(0)
    await expect.poll(() => tabSession(page)).toBe('signed-in')
    expect((await readSessionTokens(page)).refresh).not.toBe(tokens.refresh_token)
    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(1)
    expect(await refreshTokenStatus(tokens.refresh_token)).toBe(401)
  })

  test('a page opened while the password sign-in again is in flight waits for it', async ({ api, sessionContext, requires }) => {
    // Account › Access loads the memberships (EnterpriseRBAC).
    await requires({ surfaces: ['memberships'] })
    const { user, tokens } = await mintFreshSession(api)
    const context = await sessionContext(tokens)
    const page = await context.newPage()
    const signIn = await answerSignInAgain(context, user, { hold: true })
    let refreshes = 0
    page.on('request', (request) => {
      if (isRefresh(request.url(), request.method())) refreshes++
    })

    await page.goto('/app/account/security')
    await expect(page.getByRole('heading', { name: 'Change password' })).toBeVisible(BOOT)
    const changed = page.waitForResponse(r => isChangePassword(r.url(), r.request().method()))
    await changePasswordInAccount(page, TEST_PASSWORD, NEW_PASSWORD)
    expect((await changed).status()).toBeLessThan(300)
    await expect.poll(() => signIn.body()).toMatchObject({ email: user.email, password: NEW_PASSWORD })

    // While the sign-in is in flight, the tab moves on to Access, whose memberships request goes
    // out with the access token the change just ended and is refused. Its renewal waits for the
    // sign-in instead of presenting the revoked refresh token, which would sign the tab out; it
    // then replays with the new session.
    const refused = page.waitForResponse(r => r.url().startsWith(apiUrl('/memberships/me')) && r.status() === 401)
    await page.getByRole('navigation', { name: 'Account sections' }).getByRole('link', { name: 'Access' }).click()
    await refused
    signIn.release()

    await expect(page.getByText('Password changed', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('Your other devices were signed out. You are still signed in here.').first()).toBeVisible()
    await expect(page).toHaveURL(/\/app\/account\/access$/)
    await expect(page.getByRole('heading', { name: 'Memberships', exact: true })).toBeVisible()
    // The replayed request answered the card (this fresh account has no memberships); the
    // sign-in again did not leave it loading.
    await expect(page.getByRole('heading', { name: 'No memberships', exact: true })).toBeVisible()
    expect(refreshes, 'nothing presented the refresh token the change revoked').toBe(0)
    // The tab holds a new, working session (not the one the change ended), and it renews.
    await expect.poll(() => tabSession(page)).toBe('signed-in')
    expect((await readSessionTokens(page)).refresh).not.toBe(tokens.refresh_token)
    // Only the new sign-in is left; the pair the change ended can no longer renew.
    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(1)
    expect(await refreshTokenStatus(tokens.refresh_token)).toBe(401)
  })

  test('signing out everywhere after idling ends every session on the server', async ({ api, sessionContext }) => {
    const { user, tokens } = await mintFreshSession(api)
    const page = await (await sessionContext(tokens)).newPage()

    await page.goto('/app/account/security')
    await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible(BOOT)
    await expireAccessToken(page)

    const refreshed = page.waitForResponse(r => isRefresh(r.url(), r.request().method()))
    const revoked = page.waitForResponse(r => isRevokeAll(r.url(), r.request().method()) && r.status() !== 401)
    await signOutEverywhere(page)

    const held = await heldAfterRefresh(refreshed)
    expect((await revoked).status()).toBeLessThan(300)
    expect(await refreshTokenStatus(held.refresh_token)).toBe(401)
    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(0)
  })

  test('signing out everywhere signs this tab out as well, with a notice', async ({ api, sessionContext }) => {
    const { tokens } = await mintFreshSession(api)
    const page = await (await sessionContext(tokens)).newPage()

    await page.goto('/app/account/security')
    await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible(BOOT)
    // This browser's session is the one marked in the table.
    await expect(page.getByText('This browser', { exact: true })).toBeVisible()
    const revoked = page.waitForResponse(r => isRevokeAll(r.url(), r.request().method()))
    const blacklist = page.waitForRequest(r => r.url() === apiUrl('/auth/logout') && r.method() === 'POST')
    await signOutEverywhere(page)
    expect((await revoked).status()).toBeLessThan(300)

    await expect(page).toHaveURL(/\/auth\/login\?.*reason=signed_out_everywhere/)
    await expect(page.getByText('You signed out everywhere', { exact: true })).toBeVisible()
    await expect.poll(() => tabSession(page)).toBe('signed-out')
    // The access token this tab held is then blacklisted (a logout without a refresh token,
    // immediate), so on a host with token blacklisting on a copy of it stops working at once.
    // The example backends leave blacklisting off, so only the request is checked.
    const logout = await blacklist
    expect(logout.postDataJSON()).toEqual({ immediate: true })
    expect(logout.headers().authorization).toBe(`Bearer ${tokens.access_token}`)
  })
})
