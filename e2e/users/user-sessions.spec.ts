import { expect, test } from '../support/fixtures'
import { cardByHeading } from '../support/entities'
import { TEST_PASSWORD } from '../support/api-client'
import { accessTokenStatus, expireAccessToken, mintAnotherSession, mintFreshSession, refreshTokenStatus } from '../support/sessions'
import { onPath } from '../support/session'
import { userDetailPath } from '../support/users'
import { apiUrl } from '../support/env'
import { corsHeaders, jsonResponse } from '../support/mocks'

// Admin force sign-out on the user detail's Security tab (WP-12, F-014): revoke one session of
// another account, or every one. outlabs-auth 0.1.0a35 marks this browser's session only on the
// admin's own account and has no keep-current option for another one. The sessions belong to fresh run-marked users (never a shared
// persona); the second device signs in with a known browser so its row can be named.
// Real sessions come from the example backends' invite and magic-link captures: a backend
// without them would spend the run's per-IP password-login budget, which the session lane needs,
// so there the same flows run against route-mocked sessions instead.

const FIREFOX_ON_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'
type Session = { id: string, user_agent?: string | null }

test.describe('user sessions (admin)', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, surfaces: ['users'] })
  })

  test('revoking one session signs that device out at its next renewal; the other stays signed in', async ({ page, api, sessionContext, errorGuard, requires }) => {
    await requires({ capture: ['invite', 'magic-link'] })
    // The revoked device: its expired access token and its refused renewal answer 401.
    errorGuard.allow({ kind: 'api', status: 401 }, { kind: 'console', console: /status of 401/ })
    const { user, tokens: kept } = await mintFreshSession(api, 'admin-revoke-one')
    // A moment later, as a second device would (sessions are ordered by when they were last active).
    await new Promise(resolve => setTimeout(resolve, 100))
    const revoked = await mintAnotherSession(user, TEST_PASSWORD, { userAgent: FIREFOX_ON_WINDOWS })
    const sessions = await api.get<Session[]>(`/users/${user.id}/sessions`)
    expect(sessions).toHaveLength(2)
    const keptId = sessions.find(session => session.user_agent !== FIREFOX_ON_WINDOWS)!.id

    // The second device has the console open.
    const device = await (await sessionContext(revoked)).newPage()
    await device.goto('/app/account')
    await expect(device.getByRole('heading', { name: 'Profile' })).toBeVisible()

    await page.goto(userDetailPath(user.id, 'security'))
    const card = cardByHeading(page, 'Active sessions')
    await expect(card.locator('tbody tr')).toHaveCount(2)
    // Another account's sessions: the server marks none as this browser's, although one is open.
    await expect(card.getByText('This browser', { exact: true })).toHaveCount(0)
    await card.getByRole('button', { name: /^Revoke session: Firefox 130 on Windows/ }).click()
    const confirm = page.getByRole('dialog', { name: /^Revoke session Firefox 130 on Windows/ })
    await expect(confirm).toContainText(user.email)
    await expect(confirm.getByTestId('confirm-effects')).toContainText('signed out when its current access token expires')
    await confirm.getByRole('button', { name: 'Revoke session' }).click()
    await expect(page.getByText('Session revoked', { exact: true })).toBeVisible()
    await expect(card.locator('tbody tr')).toHaveCount(1)
    await expect(card.getByRole('button', { name: /^Revoke session: Firefox/ })).toHaveCount(0)
    expect((await api.get<Session[]>(`/users/${user.id}/sessions`)).map(session => session.id)).toEqual([keptId])

    // The revoked device's next renewal is refused: the console signs it out.
    await expireAccessToken(device)
    await device.reload()
    await expect(device).toHaveURL(onPath('/auth/login'))
    // The other session is untouched.
    expect(await accessTokenStatus(kept.access_token)).toBe(200)
    expect(await refreshTokenStatus(kept.refresh_token)).toBe(200)
  })

  test('Sign out everywhere ends every session of the account, after asking', async ({ page, api, requires }) => {
    await requires({ capture: ['invite', 'magic-link'] })
    const { user } = await mintFreshSession(api, 'admin-revoke-all')
    await mintAnotherSession(user, TEST_PASSWORD, { userAgent: FIREFOX_ON_WINDOWS })
    expect(await api.get<Session[]>(`/users/${user.id}/sessions`)).toHaveLength(2)

    await page.goto(userDetailPath(user.id, 'security'))
    const card = cardByHeading(page, 'Active sessions')
    await expect(card.locator('tbody tr')).toHaveCount(2)
    await card.getByRole('button', { name: 'Sign out everywhere' }).click()
    const confirm = page.getByRole('dialog', { name: `Sign out ${user.email} everywhere` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('API keys are not affected')
    await confirm.getByRole('button', { name: 'Sign out everywhere' }).click()
    await expect(page.getByText('Signed out everywhere', { exact: true })).toBeVisible()
    await expect(card.getByText('No sessions', { exact: true })).toBeVisible()
    // Nothing left to end.
    await expect(card.getByRole('button', { name: 'Sign out everywhere' })).toHaveCount(0)
    expect(await api.get<Session[]>(`/users/${user.id}/sessions`)).toHaveLength(0)
  })

  test('the admin\'s own sessions are managed from Account, not revoked here', async ({ page, api }) => {
    const me = await api.me()
    await page.goto(userDetailPath(me.id, 'security'))
    const card = cardByHeading(page, 'Active sessions')
    await expect(card.locator('tbody tr').first()).toBeVisible()
    // On their own account the server marks the session this browser holds; it comes first.
    await expect(card.locator('tbody tr').first().getByText('This browser', { exact: true })).toBeVisible()
    await expect(card.getByText('This browser', { exact: true })).toHaveCount(1)
    await expect(card.getByRole('button', { name: /^Revoke session/ })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /^Sign out of this browser/ })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Sign out everywhere' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Sign out other devices' })).toHaveCount(0)
  })

  test('revoke and Sign out everywhere call the admin session endpoints (mocked sessions)', async ({ page, api }) => {
    // The UI's half on any preset, without a password login: the sessions are route-mocked and
    // the two DELETEs are answered by the test.
    const user = await api.createUser({ kind: 'admin-revoke-mocked' })
    const now = Date.now()
    let sessions = [
      { id: 's-firefox', device_name: null, ip_address: '203.0.113.42', user_agent: FIREFOX_ON_WINDOWS, created_at: new Date(now - 60_000).toISOString(), last_used_at: null, expires_at: new Date(now + 7 * 86_400_000).toISOString(), usage_count: 1 },
      { id: 's-other', device_name: null, ip_address: '198.51.100.7', user_agent: null, created_at: new Date(now - 3_600_000).toISOString(), last_used_at: null, expires_at: new Date(now + 7 * 86_400_000).toISOString(), usage_count: 1 }
    ]
    const deletes: string[] = []
    await page.route(url => url.pathname.startsWith(new URL(apiUrl(`/users/${user.id}/sessions`)).pathname), async (route) => {
      const request = route.request()
      if (request.method() === 'GET') return route.fulfill(jsonResponse(200, sessions))
      if (request.method() === 'DELETE') {
        const path = new URL(request.url()).pathname
        deletes.push(path.slice(path.indexOf(`/users/${user.id}`)))
        const id = path.split('/sessions/')[1]
        sessions = id ? sessions.filter(session => session.id !== id) : []
        return route.fulfill({ status: 204, headers: corsHeaders() })
      }
      return route.fallback()
    })

    await page.goto(userDetailPath(user.id, 'security'))
    const card = cardByHeading(page, 'Active sessions')
    await expect(card.locator('tbody tr')).toHaveCount(2)
    // Another account's sessions: the server marks none as this browser's, although one is open.
    await expect(card.getByText('This browser', { exact: true })).toHaveCount(0)
    await card.getByRole('button', { name: /^Revoke session: Firefox 130 on Windows/ }).click()
    await page.getByRole('dialog', { name: /^Revoke session Firefox 130 on Windows/ }).getByRole('button', { name: 'Revoke session' }).click()
    await expect(page.getByText('Session revoked', { exact: true })).toBeVisible()
    await expect(card.locator('tbody tr')).toHaveCount(1)

    await card.getByRole('button', { name: 'Sign out everywhere' }).click()
    await page.getByRole('dialog', { name: `Sign out ${user.email} everywhere` }).getByRole('button', { name: 'Sign out everywhere' }).click()
    await expect(page.getByText('Signed out everywhere', { exact: true })).toBeVisible()
    await expect(card.getByText('No sessions', { exact: true })).toBeVisible()
    expect(deletes).toEqual([`/users/${user.id}/sessions/s-firefox`, `/users/${user.id}/sessions`])
  })
})
