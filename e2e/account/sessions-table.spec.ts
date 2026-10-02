import type { Page } from '@playwright/test'
import { expect, test } from '../support/fixtures'
import { apiUrl } from '../support/env'
import { mintAnotherSession, mintFreshSession } from '../support/sessions'
import { jsonResponse } from '../support/mocks'
import { TEST_PASSWORD } from '../support/api-client'

// AppSessionsTable on the account page and on user detail (F-093), and the card error state
// every AppQueryState card shares (F-123). Sessions belong to fresh run-marked users created
// through the API, so the rows are known and no shared persona session is touched.

type UserSession = { id: string, ip_address?: string | null, user_agent?: string | null }

const CHROME_ON_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

function cardByHeading(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true }).locator('xpath=ancestor::*[@data-slot="root"][1]')
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
  })

  test('marks this browser\'s session, and revoking another one names it, asks first and reports it', async ({ sessionContext, api }) => {
    const { user, tokens } = await mintFreshSession(api, 'sessions-revoke')
    // A second session of the same account: the device to revoke. Sessions created in the same
    // instant cannot be told apart (findCurrentSessionId), so it signs in a moment later, as a
    // second device would.
    await new Promise(resolve => setTimeout(resolve, 100))
    await mintAnotherSession(user)
    const context = await sessionContext(tokens)
    const page = await context.newPage()
    await page.goto('/app/account/security')

    const card = cardByHeading(page, 'Active sessions')
    await expect(card.getByRole('columnheader')).toHaveText(['Device', 'Last active', 'Expires', 'Actions'])
    await expect(card.locator('tbody tr')).toHaveCount(2)
    // This browser's row comes first, is marked, and signs out instead of revoking.
    const mine = card.locator('tbody tr').first()
    await expect(mine.getByText('This device', { exact: true })).toBeVisible()
    await expect(mine.getByRole('button', { name: /^Sign out of this device: / })).toBeVisible()
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
    await expect(card.getByText('This device', { exact: true })).toBeVisible()
    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(1)
  })

  test('Sign out on this browser\'s row signs the tab out', async ({ sessionContext, api }) => {
    const { user, tokens } = await mintFreshSession(api, 'sessions-sign-out')
    const page = await (await sessionContext(tokens)).newPage()
    await page.goto('/app/account/security')
    const card = cardByHeading(page, 'Active sessions')
    await card.getByRole('button', { name: /^Sign out of this device: / }).click()
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect.poll(async () => (await api.get<unknown[]>(`/users/${user.id}/sessions`)).length).toBe(0)
  })

  test('the revoke action stays on screen inside the account card on a phone and a desktop', async ({ page }) => {
    // Layout only, so the rows are the widest the API can return (a long device name, an IPv6
    // address, sessions weeks old) rather than whatever the persona has; no password login.
    const now = Date.now()
    const iso = (offsetMs: number) => new Date(now + offsetMs).toISOString()
    const DAY = 86_400_000
    const sessions = [
      { id: 'wide-1', device_name: 'Work laptop (MacBook Pro 16-inch)', ip_address: '2001:0db8:85a3:0000:0000:8a2e:0370:7334', user_agent: CHROME_ON_MAC, created_at: iso(-DAY), last_used_at: iso(-120_000), expires_at: iso(29 * DAY), usage_count: 3 },
      { id: 'wide-2', device_name: null, ip_address: '203.0.113.42', user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0', created_at: iso(-20 * DAY), last_used_at: null, expires_at: iso(10 * DAY), usage_count: 1 },
      { id: 'wide-3', device_name: 'iPhone', ip_address: '198.51.100.7', user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', created_at: iso(-2 * DAY), last_used_at: null, expires_at: iso(28 * DAY), usage_count: 1 }
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
