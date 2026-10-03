import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import { accessTokenStatus, mintAnotherSession, mintFreshSession, readSessionTokens, refreshTokenStatus } from '../support/sessions'
import { jsonResponse } from '../support/mocks'
import { TEST_PASSWORD } from '../support/api-client'

// AppSessionsTable on the account page and on user detail (F-093), the account's Sign out other
// devices, and the card error state every AppQueryState card shares (F-123). Sessions that are
// revoked belong to fresh run-marked users created through the API, so the rows are known and no
// shared persona session is touched; the persona's own list is only ever served or read.

type UserSession = { id: string, ip_address?: string | null, user_agent?: string | null, is_current?: boolean }

const CHROME_ON_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'
const FIREFOX_ON_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'
const DAY = 86_400_000

// outlabs-auth 0.1.0a35's answer to keep_current when the access token names no session (`sid`):
// a plain HTTPException through the global handler, so no reason code.
const NOT_BOUND = 'keep_current requires a session-bound access token; sign in again to obtain one, or revoke all sessions'
const NOT_BOUND_BODY = { error: 'HTTP_ERROR', message: NOT_BOUND, details: { detail: NOT_BOUND } }

const isKeepCurrent = (url: string, method: string) => url === apiUrl('/users/me/sessions?keep_current=true') && method === 'DELETE'
const isRefresh = (url: string, method: string) => url === apiUrl('/auth/refresh') && method === 'POST'

function cardByHeading(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true }).locator('xpath=ancestor::*[@data-slot="root"][1]')
}

// When a refresh token was issued (outlabs-auth's precise iat_ms, else iat), read in the runner.
function issuedAtMs(token: string): number {
  const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as { iat?: number, iat_ms?: number }
  return claims.iat_ms ?? claims.iat! * 1000
}

// The account's real sessions plus one more device (GET only), so Sign out other devices is
// offered to a fresh account that has a single session; nothing is revoked by the served row.
async function serveAnotherDevice(page: Page) {
  const now = Date.now()
  const other = { id: 's-served-device', device_name: null, ip_address: '203.0.113.42', user_agent: FIREFOX_ON_WINDOWS, created_at: new Date(now - 3_600_000).toISOString(), last_used_at: null, expires_at: new Date(now + 7 * DAY).toISOString(), usage_count: 1, is_current: false }
  await page.route(apiUrl('/users/me/sessions'), async (route) => {
    if (route.request().method() !== 'GET') return route.fallback()
    const response = await route.fetch()
    const sessions = response.ok() ? await response.json() as unknown[] : []
    return route.fulfill({ response, json: [...sessions, other] })
  })
}

// Counts the keep_current requests and the renewals the tab sends.
function countRequests(page: Page) {
  const sent = { keepCurrent: 0, refresh: 0, order: [] as string[] }
  page.on('request', (request) => {
    if (isKeepCurrent(request.url(), request.method())) {
      sent.keepCurrent++
      sent.order.push('delete')
    } else if (isRefresh(request.url(), request.method())) {
      sent.refresh++
      sent.order.push('refresh')
    }
  })
  return sent
}

test.describe('sessions table', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, surfaces: ['users'] })
  })

  test('user detail identifies each session by device, IP, last activity and expiry', async ({ page, api }) => {
    // One API password login (the only one in this spec) with a browser user agent, so the row
    // has a known device. Invite-accepted sessions record no user agent or IP.
    const user = await api.createUser({ kind: 'sessions-detail' })
    const login = await fetch(apiUrl('/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': CHROME_ON_MAC },
      body: JSON.stringify({ email: user.email, password: TEST_PASSWORD })
    })
    expect(login.ok, `login for ${user.email}`).toBe(true)
    const [session] = await api.get<UserSession[]>(`/users/${user.id}/sessions`)
    expect(session?.user_agent).toBe(CHROME_ON_MAC)

    await page.goto(`/app/users/${user.id}?tab=security`)
    const card = cardByHeading(page, 'Active sessions')
    const table = card.getByRole('table')
    await expect(table.getByRole('columnheader')).toHaveText(['Device', 'Last active', 'Expires', 'Actions'])
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(1)
    // Browser and OS from the user agent, not the raw header; the IP under it.
    const device = rows.first().getByRole('cell').first()
    await expect(device).toContainText('Chrome 128 on macOS')
    await expect(rows.first()).not.toContainText('Mozilla/5.0')
    if (session!.ip_address) await expect(device).toContainText(session!.ip_address)
    await expect(rows.first()).toContainText(/just now|minutes? ago/)
    // Both relative, whatever the refresh-token lifetime ("in 7 days", "in 4 weeks").
    await expect(rows.first()).toContainText(/in \d+ (hours|days|weeks|months)|tomorrow|next (week|month)/)
    // Last active and Expires; the phone-only copy of Last active under the device is hidden.
    const times = rows.first().locator('time:visible')
    await expect(times).toHaveCount(2)
    await expect(times.first()).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    // An admin with user:update can end it (F-014; e2e/users/user-sessions.spec.ts).
    await expect(card.getByRole('button', { name: /^Revoke session: Chrome 128 on macOS/ })).toBeVisible()
    // The server marks a session as this browser's only on one's own account.
    expect(session!.is_current).toBe(false)
    await expect(card.getByText('This browser', { exact: true })).toHaveCount(0)
  })

  test('the server marks this browser\'s session, whatever the session times say', async ({ page }) => {
    // outlabs-auth 0.1.0a35 marks the session that made the request (`is_current`). The served
    // list (GET only; the admin persona's session is never touched) puts another row at the
    // instant this browser's refresh token was issued, which the console's former guess picked.
    await page.goto('/app/account')
    await expect(page.getByRole('heading', { name: 'Profile', exact: true })).toBeVisible()
    const { refresh } = await readSessionTokens(page)
    const issued = issuedAtMs(refresh!)
    const sessions = [
      { id: 's-issued-together', device_name: null, ip_address: '198.51.100.7', user_agent: FIREFOX_ON_WINDOWS, created_at: new Date(issued).toISOString(), last_used_at: null, expires_at: new Date(issued + 7 * DAY).toISOString(), usage_count: 1, is_current: false },
      { id: 's-server-marked', device_name: null, ip_address: '203.0.113.42', user_agent: CHROME_ON_MAC, created_at: new Date(issued - 2 * DAY).toISOString(), last_used_at: new Date(issued - DAY).toISOString(), expires_at: new Date(issued + 5 * DAY).toISOString(), usage_count: 3, is_current: true }
    ]
    await page.route(apiUrl('/users/me/sessions'), route => (route.request().method() === 'GET'
      ? route.fulfill(jsonResponse(200, sessions))
      : route.continue()))
    await page.goto('/app/account/security')

    const card = cardByHeading(page, 'Active sessions')
    const rows = card.locator('tbody tr')
    await expect(rows).toHaveCount(2)
    // The marked row comes first although it was active longer ago, and signs out instead of revoking.
    await expect(rows.first()).toContainText('Chrome 128 on macOS')
    await expect(rows.first().getByText('This browser', { exact: true })).toBeVisible()
    await expect(card.getByText('This browser', { exact: true })).toHaveCount(1)
    await expect(card.getByRole('button', { name: /^Sign out of this browser: Chrome 128 on macOS$/ })).toBeVisible()
    // The row created with this browser's refresh token is not marked: it is another device.
    await expect(rows.nth(1)).toContainText('Firefox 130 on Windows')
    await expect(card.getByRole('button', { name: /^Revoke session: Firefox 130 on Windows/ })).toBeVisible()
    await expect(card.getByRole('button', { name: /^Sign out of this browser: Firefox/ })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Sign out other devices' })).toBeVisible()
  })

  test('marks this browser\'s session, and revoking another one names it, asks first and reports it', async ({ sessionContext, api }) => {
    const { user, tokens } = await mintFreshSession(api, 'sessions-revoke')
    // A second session of the same account: the device to revoke.
    await mintAnotherSession(user)
    const context = await sessionContext(tokens)
    const page = await context.newPage()
    await page.goto('/app/account/security')

    const card = cardByHeading(page, 'Active sessions')
    await expect(card.getByRole('columnheader')).toHaveText(['Device', 'Last active', 'Expires', 'Actions'])
    await expect(card.locator('tbody tr')).toHaveCount(2)
    // This browser's row comes first, is marked, and signs out instead of revoking.
    const mine = card.locator('tbody tr').first()
    await expect(mine.getByText('This browser', { exact: true })).toBeVisible()
    await expect(mine.getByRole('button', { name: /^Sign out of this browser: / })).toBeVisible()
    const revoke = card.getByRole('button', { name: /^Revoke session: .+, active (just now|\d+ minutes? ago)$/ })
    await expect(revoke).toHaveCount(1)

    await revoke.click()
    const confirm = page.getByRole('dialog', { name: /^Revoke session / })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('can no longer renew its session')
    const deleted = page.waitForRequest(request => request.method() === 'DELETE' && request.url().startsWith(apiUrl('/users/me/sessions/')))
    await confirm.getByRole('button', { name: 'Revoke session' }).click()
    await deleted
    await expect(page.getByText('Session revoked').first()).toBeVisible()
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByText('This browser', { exact: true })).toBeVisible()
    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(1)
  })

  test('Sign out on this browser\'s row signs the tab out', async ({ sessionContext, api }) => {
    const { user, tokens } = await mintFreshSession(api, 'sessions-sign-out')
    const page = await (await sessionContext(tokens)).newPage()
    await page.goto('/app/account/security')
    const card = cardByHeading(page, 'Active sessions')
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByText('This browser', { exact: true })).toBeVisible()
    // The only session is this browser's: there is no other device to sign out.
    await expect(card.getByRole('button', { name: 'Sign out everywhere' })).toBeVisible()
    await expect(card.getByRole('button', { name: 'Sign out other devices' })).toHaveCount(0)
    await card.getByRole('button', { name: /^Sign out of this browser: / }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(0)
  })

  test('Sign out other devices keeps this browser and ends the others', async ({ sessionContext, api }) => {
    const { user, tokens } = await mintFreshSession(api, 'sessions-others')
    const other = await mintAnotherSession(user, TEST_PASSWORD, { userAgent: FIREFOX_ON_WINDOWS })
    const page = await (await sessionContext(tokens)).newPage()
    const sent = countRequests(page)
    await page.goto('/app/account/security')

    const card = cardByHeading(page, 'Active sessions')
    await expect(card.locator('tbody tr')).toHaveCount(2)
    await expect(card.locator('tbody tr').first().getByText('This browser', { exact: true })).toBeVisible()
    await card.getByRole('button', { name: 'Sign out other devices' }).click()
    const confirm = page.getByRole('dialog', { name: 'Sign out other devices' })
    await expect(confirm).toContainText('This browser stays signed in.')
    await expect(confirm.getByTestId('confirm-effects')).toContainText('API keys are not affected')
    expect(sent.keepCurrent, 'nothing is revoked before the confirmation').toBe(0)
    const revoked = page.waitForResponse(r => isKeepCurrent(r.url(), r.request().method()))
    await confirm.getByRole('button', { name: 'Sign out other devices' }).click()
    expect((await revoked).status()).toBe(204)

    await expect(page.getByText('Signed out of other devices', { exact: true })).toBeVisible()
    await expect(confirm).toBeHidden()
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByText('This browser', { exact: true })).toBeVisible()
    // Nothing left to sign out but this browser.
    await expect(card.getByRole('button', { name: 'Sign out other devices' })).toHaveCount(0)
    expect(sent).toMatchObject({ keepCurrent: 1, refresh: 0 })
    // The other device can no longer renew; the server keeps only this browser's session.
    expect(await refreshTokenStatus(other.refresh_token)).toBe(401)
    const left = await api.get<UserSession[]>(`/users/${user.id}/sessions`)
    expect(left).toHaveLength(1)
    expect(left[0]!.user_agent).not.toBe(FIREFOX_ON_WINDOWS)

    // This tab is still signed in, also after a reload.
    await page.reload()
    await expect(page).toHaveURL(/\/app\/account\/security$/)
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByText('This browser', { exact: true })).toBeVisible()
    const held = await readSessionTokens(page)
    expect(held.refresh).toBe(tokens.refresh_token)
    expect(await accessTokenStatus(held.access!)).toBe(200)
  })

  test('an access token that names no session is renewed once, then the others are signed out', async ({ sessionContext, api, errorGuard }) => {
    // A token minted before outlabs-auth 0.1.0a35 carries no `sid`, so keep_current is refused
    // with a 400 until the token is renewed. The first request is answered with that 400; the
    // renewal and the request after it reach the API.
    errorGuard.allow({ status: 400, url: apiUrl('/users/me/sessions') })
    const { user, tokens } = await mintFreshSession(api, 'sessions-unbound-renewed')
    const page = await (await sessionContext(tokens)).newPage()
    await serveAnotherDevice(page)
    let refused = 0
    await page.route(apiUrl('/users/me/sessions?keep_current=true'), async (route) => {
      if (route.request().method() !== 'DELETE' || refused > 0) return route.fallback()
      refused++
      return route.fulfill(jsonResponse(400, NOT_BOUND_BODY))
    })
    const sent = countRequests(page)
    await page.goto('/app/account/security')

    const card = cardByHeading(page, 'Active sessions')
    await card.getByRole('button', { name: 'Sign out other devices' }).click()
    const confirm = page.getByRole('dialog', { name: 'Sign out other devices' })
    const retried = page.waitForResponse(r => isKeepCurrent(r.url(), r.request().method()) && r.status() !== 400)
    await confirm.getByRole('button', { name: 'Sign out other devices' }).click()
    expect((await retried).status()).toBe(204)

    await expect(page.getByText('Signed out of other devices', { exact: true })).toBeVisible()
    await expect(confirm).toBeHidden()
    await expect(card.getByRole('alert')).toHaveCount(0)
    // Refused, renewed once through the refresh lock, asked again.
    expect(sent.order).toEqual(['delete', 'refresh', 'delete'])
    // This tab holds the renewed session, which still works.
    const held = await readSessionTokens(page)
    expect(held.refresh).not.toBe(tokens.refresh_token)
    expect(await accessTokenStatus(held.access!)).toBe(200)
    await expect(page).toHaveURL(/\/app\/account\/security$/)
    expect(await api.get<unknown[]>(`/users/${user.id}/sessions`)).toHaveLength(1)
  })

  test('a session the server cannot identify explains itself and offers Sign out everywhere', async ({ sessionContext, api, errorGuard }) => {
    // The server still cannot tell which session is this browser's after a renewal (a host that
    // binds no sessions): both requests are answered with outlabs-auth's 400.
    errorGuard.allow({ status: 400, url: apiUrl('/users/me/sessions') })
    const { user, tokens } = await mintFreshSession(api, 'sessions-unbound')
    const page = await (await sessionContext(tokens)).newPage()
    await serveAnotherDevice(page)
    await page.route(apiUrl('/users/me/sessions?keep_current=true'), route => (route.request().method() === 'DELETE'
      ? route.fulfill(jsonResponse(400, NOT_BOUND_BODY))
      : route.fallback()))
    const sent = countRequests(page)
    await page.goto('/app/account/security')

    const card = cardByHeading(page, 'Active sessions')
    const opener = card.getByRole('button', { name: 'Sign out other devices' })
    await opener.click()
    const confirm = page.getByRole('dialog', { name: 'Sign out other devices' })
    await confirm.getByRole('button', { name: 'Sign out other devices' }).click()

    // The dialog closes; the card says why, instead of a generic failure toast.
    const notice = card.getByRole('alert')
    await expect(notice).toContainText('This browser can\'t be kept signed in')
    await expect(notice).toContainText('The server cannot tell which session is this browser\'s')
    await expect(confirm).toBeHidden()
    await expect(page.getByText('Could not sign out other devices')).toHaveCount(0)
    await expect(page.getByText('Signed out of other devices')).toHaveCount(0)
    expect(sent.order).toEqual(['delete', 'refresh', 'delete'])

    // Its action is the existing Sign out everywhere confirmation; cancelling it changes nothing.
    await notice.getByRole('button', { name: 'Sign out everywhere' }).click()
    const everywhere = page.getByRole('dialog', { name: 'Sign out everywhere' })
    await expect(everywhere.getByTestId('confirm-effects')).toContainText('This browser is signed out too')
    await everywhere.getByRole('button', { name: 'Cancel' }).click()
    await expect(everywhere).toBeHidden()

    // Nothing was revoked and this tab is still signed in.
    await expect(page).toHaveURL(/\/app\/account\/security$/)
    const held = await readSessionTokens(page)
    expect(await accessTokenStatus(held.access!)).toBe(200)
    expect(await api.get<unknown[]>(`/users/${user.id}/sessions`)).toHaveLength(1)
    // The notice can be dismissed.
    await notice.getByRole('button', { name: 'Close' }).click()
    await expect(card.getByRole('alert')).toHaveCount(0)
  })

  test('the revoke action stays on screen inside the account card on a phone and a desktop', async ({ page }) => {
    // Layout only, so the rows are the widest the API can return (a long device name, an IPv6
    // address, sessions weeks old) rather than whatever the persona has; no password login.
    const now = Date.now()
    const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()
    const sessions = [
      { id: 'wide-1', device_name: 'Work laptop (MacBook Pro 16-inch)', ip_address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', user_agent: CHROME_ON_MAC, created_at: iso(-DAY), last_used_at: iso(-120_000), expires_at: iso(29 * DAY), usage_count: 3, is_current: false },
      { id: 'wide-2', device_name: null, ip_address: '203.0.113.42', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0', created_at: iso(-20 * DAY), last_used_at: null, expires_at: iso(10 * DAY), usage_count: 1, is_current: false },
      { id: 'wide-3', device_name: 'iPhone', ip_address: '198.51.100.7', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', created_at: iso(-2 * DAY), last_used_at: null, expires_at: iso(28 * DAY), usage_count: 1, is_current: false }
    ]
    await page.route(apiUrl('/users/me/sessions'), route => (route.request().method() === 'GET'
      ? route.fulfill(jsonResponse(200, sessions))
      : route.continue()))

    for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/app/account/security')
      const card = cardByHeading(page, 'Active sessions')
      const table = card.getByRole('table')
      await expect(table.locator('tbody tr')).toHaveCount(sessions.length)
      await expect(table.locator('tbody tr').first()).toContainText('Chrome 128 on macOS')
      const revokes = card.getByRole('button', { name: /^Revoke session: / })
      await expect(revokes).toHaveCount(sessions.length)

      // The table fits its card: no sideways scrolling to reach Revoke.
      const scroller = table.locator('xpath=..')
      const fits = await scroller.evaluate(el => el.scrollWidth <= el.clientWidth)
      expect(fits, `sessions table scrolls sideways at ${viewport.width}px`).toBe(true)
      // And every button is inside both the table's box and the viewport.
      const box = await scroller.boundingBox()
      for (const revoke of await revokes.all()) {
        await expect(revoke).toBeVisible()
        const button = await revoke.boundingBox()
        expect(button && box, 'revoke button and table are laid out').toBeTruthy()
        expect(button!.x + button!.width, `revoke button inside the table at ${viewport.width}px`).toBeLessThanOrEqual(box!.x + box!.width + 1)
        expect(button!.x + button!.width, `revoke button inside the viewport at ${viewport.width}px`).toBeLessThanOrEqual(viewport.width)
      }
    }
  })

  test('a failed sessions query shows the error with Retry instead of an empty table', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 500, url: apiUrl('/users/me/sessions') }, { kind: 'console', console: /status of 500/ })
    let fail = true
    await page.route(apiUrl('/users/me/sessions'), async (route) => {
      if (!fail || route.request().method() !== 'GET') return route.continue()
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ detail: 'Internal server error' }) })
    })
    await page.goto('/app/account/security')

    const card = cardByHeading(page, 'Active sessions')
    const alert = card.getByRole('alert')
    await expect(alert).toContainText('Could not load sessions')
    await expect(card.getByRole('table')).toHaveCount(0)
    await expect(card.getByText('No sessions')).toHaveCount(0)

    fail = false
    await alert.getByRole('button', { name: 'Retry' }).click()
    await expect(card.getByRole('table')).toBeVisible()
    await expect(card.locator('tbody tr').first()).toBeVisible()
    await expect(card.getByRole('alert')).toHaveCount(0)
  })
})
