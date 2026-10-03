import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { withOAuthProviders } from '../support/app-config'
import { withExtraSurfaces, withoutSurfaces } from '../support/capabilities'
import { apiUrl, appOrigin } from '../support/env'

// Connected social accounts on Account (gap-backlog #1, F-094, F-104, F-194). Authenticated
// project (admin storageState). The associate redirect loop is exercised with an intercepted
// authorize response — a real provider roundtrip needs live client secrets (manual checklist).
// Linked accounts are served from a mocked list, so the persona's record is never changed.

const LINKED = {
  id: 'sa-1',
  provider: 'google',
  provider_user_id: 'g-123',
  email: 'admin.google@example.com',
  email_verified: false,
  display_name: 'Admin Example',
  avatar_url: null,
  linked_at: '2026-08-01T10:00:00Z',
  last_used_at: null
}

function tabs(page: Page) {
  return page.getByRole('navigation', { name: 'Account sections' })
}

async function withGoogleProvider(page: Page, frontendProfileKey?: string) {
  await withOAuthProviders(page, ['google'], frontendProfileKey)
}

// One linked account; DELETE answers with `deleteStatus` (204 unlinks it).
async function withLinkedAccount(page: Page, deleteStatus = 204, account: typeof LINKED | (Omit<typeof LINKED, 'avatar_url'> & { avatar_url: string }) = LINKED) {
  let linked = [account]
  const deleted: string[] = []
  await page.route('**/v1/users/me/social-accounts**', async (route) => {
    const request = route.request()
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 })
    if (request.method() === 'DELETE') {
      deleted.push(request.url().split('/').pop() ?? '')
      if (deleteStatus !== 204) {
        const message = 'Cannot unlink last authentication method. User must have at least one way to log in (password or social account).'
        return route.fulfill({ status: deleteStatus, contentType: 'application/json', body: JSON.stringify({ error: 'HTTP_ERROR', message, details: { detail: message } }) })
      }
      linked = []
      return route.fulfill({ status: 204 })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(linked) })
  })
  return deleted
}

test.describe('social accounts', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('no Connected accounts tab when there is nothing to link and nothing linked', async ({ page }) => {
    await withoutSurfaces(page, ['oauth_associate'])
    await withGoogleProvider(page)
    await page.goto('/app/account')
    await expect(tabs(page).getByRole('link', { name: 'Security' })).toBeVisible()
    await expect(tabs(page).getByRole('link', { name: 'Connected accounts' })).toHaveCount(0)
    // A deep link explains itself instead of offering buttons that cannot work.
    await page.goto('/app/account/connections')
    await expect(page.getByText('No sign-in providers')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Link Google' })).toHaveCount(0)
  })

  test('link button starts the associate flow; the callback toast fires on return', async ({ page }) => {
    // Link buttons need the backend's oauth_associate router (neither example mounts it).
    await withExtraSurfaces(page, ['oauth_associate'])
    await withGoogleProvider(page, 'console')
    // Intercept the authorize call and send the "provider" straight back to the SPA callback
    // target — the associate success redirect lands on /app/account?linked=google.
    let authorizeUrl = ''
    await page.route('**/oauth-associate/google/authorize**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
      authorizeUrl = route.request().url()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ authorization_url: `${appOrigin}/app/account?linked=google` })
      })
    })

    await page.goto('/app/account')
    await tabs(page).getByRole('link', { name: 'Connected accounts' }).click()
    await expect(page.getByRole('heading', { name: 'Connected accounts' })).toBeVisible()
    await expect(page.getByText('No linked accounts. Link one below to sign in with it.')).toBeVisible()
    await page.getByRole('button', { name: 'Link Google' }).click()
    // The associate authorize call carries the frontend profile key like sign-in does.
    await expect.poll(() => authorizeUrl).toContain('app=console')

    // The provider "returns" to /app/account?linked=google; the toast fires once.
    await expect(page.getByText('Google account linked', { exact: true })).toBeVisible()
    // The query param is consumed and cleaned from the URL.
    await expect(page).toHaveURL(/\/app\/account$/)
  })

  test('a linked account shows its provider email, verification and use; unlinking asks first', async ({ page }) => {
    const deleted = await withLinkedAccount(page)
    await page.goto('/app/account/connections')
    await expect(tabs(page).getByRole('link', { name: 'Connected accounts' })).toHaveAttribute('aria-current', 'page')
    await expect(page.getByText('Admin Example')).toBeVisible()
    await expect(page.getByText(`· ${LINKED.email}`)).toBeVisible()
    await expect(page.getByText('Unverified email', { exact: true })).toBeVisible()
    await expect(page.getByText(/Last used never/)).toBeVisible()

    await page.getByRole('button', { name: `Unlink Google account ${LINKED.email}` }).click()
    const confirm = page.getByRole('dialog', { name: `Unlink Google account ${LINKED.email}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('It is your only linked account')
    await confirm.getByRole('button', { name: 'Unlink account' }).click()
    await expect.poll(() => deleted).toEqual(['sa-1'])
    await expect(page.getByText('Google account unlinked', { exact: true })).toBeVisible()
    await expect(page.getByText('Admin Example')).toHaveCount(0)
  })

  // The shipped CSP allows images from the console's origin and data: only, so a provider's
  // picture would be blocked and logged as a violation; the row shows the provider icon instead
  // (c-security-csp-blocks-provider-avatars, v-auth-shell-10). The static target checks the CSP.
  test('a provider picture on another host is never requested: the row shows the provider icon', async ({ page }) => {
    const remote: string[] = []
    page.on('request', (request) => {
      if (new URL(request.url()).hostname === 'lh3.googleusercontent.com') remote.push(request.url())
    })
    await withLinkedAccount(page, 204, { ...LINKED, avatar_url: 'https://lh3.googleusercontent.com/a/e2e-photo.jpg' })
    await page.goto('/app/account/connections')
    const row = page.getByRole('listitem').filter({ hasText: 'Admin Example' })
    await expect(row).toBeVisible()
    await expect(row.locator('img')).toHaveCount(0)
    await expect(row.locator('[data-slot="avatar"] [data-slot="icon"]')).toBeVisible()
    expect(remote).toEqual([])
  })

  test('unlinking the last sign-in method shows the server\'s refusal in the dialog', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 400 }, { kind: 'console', console: /status of 400/ })
    const deleted = await withLinkedAccount(page, 400)
    await page.goto('/app/account/connections')
    await page.getByRole('button', { name: `Unlink Google account ${LINKED.email}` }).click()
    const confirm = page.getByRole('dialog', { name: `Unlink Google account ${LINKED.email}` })
    await confirm.getByRole('button', { name: 'Unlink account' }).click()
    await expect.poll(() => deleted).toEqual(['sa-1'])
    await expect(confirm.getByTestId('api-error-alert')).toContainText('Cannot unlink last authentication method')
    await expect(confirm).toBeVisible()
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByText('Admin Example')).toBeVisible()
  })
})

// A failed link (F-104). outlabs-auth 0.1.0a35's associate callback redirects a failure back to
// the deployment's account landing with ?link_error=<code>&provider=<name> (/app/account in the
// example profile; a deployment may name another account tab). Every documented code gets its
// own message on Connected accounts, the address is cleaned so a reload does not repeat it, and
// the next step is offered: Try again where the provider can be linked, unlinking the other
// account of that provider for provider_conflict.
const GITHUB_LINKED = { ...LINKED, id: 'sa-2', provider: 'github', provider_user_id: 'gh-9', email: 'admin.github@example.com', display_name: 'Admin On GitHub' }

const LINK_ERRORS = [
  {
    code: 'cancelled',
    landing: '/app/account',
    title: 'Linking was cancelled',
    description: 'You cancelled at Google. Nothing changed. Link again when you are ready.'
  },
  {
    // The Google account belongs to another user; this one has a GitHub account linked.
    code: 'already_linked',
    landing: '/app/account',
    linked: [GITHUB_LINKED],
    title: 'That Google account belongs to someone else',
    description: 'It is already linked to another account here. Sign in to that account and unlink it there, or link a different Google account.'
  },
  {
    // A different Google account is already linked to this user: no retry, unlink it first.
    code: 'provider_conflict',
    landing: '/app/account',
    linked: [LINKED],
    title: 'Another Google account is already linked',
    description: 'Your account already has a different Google account linked. Unlink it first, then link this one.'
  },
  {
    // A deployment whose profile lands on another account tab.
    code: 'invalid_state',
    landing: '/app/account/security',
    title: 'The link request expired',
    description: 'It took too long or was finished in another browser. Start again from this page.'
  },
  {
    // A deployment whose profile lands on Connected accounts itself.
    code: 'provider',
    landing: '/app/account/connections',
    title: 'Google did not complete the link',
    description: 'The provider reported an error. Try again, or link it later.'
  },
  {
    code: 'auth',
    landing: '/app/account',
    title: 'The server refused the link',
    description: 'Your account could not be confirmed. Sign in again and retry; if it keeps failing, ask an administrator.'
  },
  {
    // A code a later release may add.
    code: 'quota_exceeded',
    landing: '/app/account',
    title: 'Could not link the account',
    description: 'Linking your Google account did not work. Try again, or link it later.'
  }
]

// Linked accounts served as given (none: an empty list).
async function serveLinkedAccounts(page: Page, accounts: Array<Record<string, unknown>>) {
  await page.route('**/v1/users/me/social-accounts**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(accounts) })
  })
}

// The associate authorize call, recorded; the "provider" sends the browser to `destination`.
async function interceptGoogleAuthorize(page: Page, destination: string) {
  const calls: string[] = []
  await page.route('**/oauth-associate/google/authorize**', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
    calls.push(route.request().url())
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ authorization_url: destination }) })
  })
  return calls
}

function linkAlert(page: Page) {
  return page.getByRole('alert').filter({ has: page.getByRole('button', { name: 'Close' }) })
}

test.describe('social accounts: a failed link (F-104)', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  for (const failure of LINK_ERRORS) {
    test(`link_error=${failure.code} landing on ${failure.landing}: a specific message on Connected accounts, once`, async ({ page }) => {
      await withExtraSurfaces(page, ['oauth_associate'])
      await withGoogleProvider(page, 'console')
      await serveLinkedAccounts(page, failure.linked ?? [])
      const authorize = await interceptGoogleAuthorize(page, `${appOrigin}/app/account/connections`)

      await page.goto(`${failure.landing}?link_error=${failure.code}&provider=google`)
      // Connected accounts opens, whatever account tab the landing was, and the address is clean.
      await expect(page).toHaveURL(url => url.pathname === '/app/account/connections' && url.search === '')
      await expect(tabs(page).getByRole('link', { name: 'Connected accounts' })).toHaveAttribute('aria-current', 'page')
      const alert = linkAlert(page)
      await expect(alert).toHaveCount(1)
      await expect(alert.getByText(failure.title, { exact: true })).toBeVisible()
      await expect(alert.getByText(failure.description, { exact: true })).toBeVisible()
      // Never the sign-in copy the sign-in callback's codes get.
      await expect(page.getByText('Sign-in could not be completed')).toHaveCount(0)

      if (failure.code === 'provider_conflict') {
        // No retry while the other Google account is linked: the step is to unlink it, which
        // opens the same confirmation as its row.
        await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0)
        await expect(page.getByRole('button', { name: 'Link Google', exact: true })).toHaveCount(0)
        await alert.getByRole('button', { name: 'Unlink Google account' }).click()
        const confirm = page.getByRole('dialog', { name: `Unlink Google account ${LINKED.email}` })
        await expect(confirm).toBeVisible()
        await confirm.getByRole('button', { name: 'Cancel' }).click()
        await expect(confirm).toBeHidden()
        // A reload of the cleaned address does not repeat the message.
        await page.reload()
        await expect(page.getByRole('heading', { name: 'Connected accounts' })).toBeVisible()
        await expect(page.getByText(failure.title, { exact: true })).toHaveCount(0)
        expect(authorize).toEqual([])
        return
      }

      // Try again starts the associate flow again for that provider; the "provider" sends the
      // browser straight back to Connected accounts, which does not repeat the message.
      await expect(alert.getByRole('button', { name: 'Unlink Google account' })).toHaveCount(0)
      const returned = page.waitForEvent('load')
      await alert.getByRole('button', { name: 'Try again' }).click()
      await expect.poll(() => authorize.length).toBe(1)
      expect(authorize[0]).toContain('app=console')
      await returned
      await expect(page).toHaveURL(url => url.pathname === '/app/account/connections' && url.search === '')
      await expect(page.getByRole('button', { name: 'Link Google', exact: true })).toBeVisible()
      await expect(page.getByText(failure.title, { exact: true })).toHaveCount(0)
    })
  }

  test('the round trip: the callback\'s redirect lands on Account and the failure is explained there', async ({ page }) => {
    await withExtraSurfaces(page, ['oauth_associate'])
    await withGoogleProvider(page, 'console')
    await serveLinkedAccounts(page, [])
    // The provider sends the browser to the API's associate callback, which redirects the failure
    // back to the profile's landing (outlabs-auth 0.1.0a35, routers/oauth_associate.py).
    const callback = apiUrl('/oauth-associate/google/callback')
    const authorize = await interceptGoogleAuthorize(page, `${callback}?code=e2e-code&state=e2e-state`)
    let redirected = 0
    await page.route(url => url.href.startsWith(`${callback}?`), async (route) => {
      redirected += 1
      return route.fulfill({ status: 302, headers: { location: `${appOrigin}/app/account?link_error=already_linked&provider=google` } })
    })

    await page.goto('/app/account/connections')
    const landed = page.waitForEvent('load')
    await page.getByRole('button', { name: 'Link Google', exact: true }).click()
    await expect.poll(() => authorize.length).toBe(1)
    await landed
    expect(redirected).toBe(1)
    const alert = linkAlert(page)
    await expect(alert.getByText('That Google account belongs to someone else', { exact: true })).toBeVisible()
    // Account opened Connected accounts and cleaned the address.
    await expect(page).toHaveURL(url => url.pathname === '/app/account/connections' && url.search === '')
    // One persistent message, not a toast that disappears.
    await expect(page.getByText('Could not link the account', { exact: true })).toHaveCount(0)
    // Closing it removes it.
    await alert.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('That Google account belongs to someone else', { exact: true })).toHaveCount(0)
  })

  // Without providers to link and with nothing linked there is no Connected accounts tab: the
  // account frame says what failed instead, above the tab the landing opened.
  test('where there is no Connected accounts tab, the account frame explains the failure', async ({ page }) => {
    await withoutSurfaces(page, ['oauth_associate'])
    await withGoogleProvider(page)
    await serveLinkedAccounts(page, [])
    await page.goto('/app/account?link_error=auth&provider=google')
    await expect(page).toHaveURL(url => url.pathname === '/app/account' && url.search === '')
    await expect(tabs(page).getByRole('link', { name: 'Connected accounts' })).toHaveCount(0)
    const alert = linkAlert(page)
    await expect(alert.getByText('The server refused the link', { exact: true })).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Try again' })).toHaveCount(0)
    // It stays while the account tabs change, until closed.
    await tabs(page).getByRole('link', { name: 'Security' }).click()
    await expect(page).toHaveURL(/\/app\/account\/security$/)
    await expect(alert.getByText('The server refused the link', { exact: true })).toBeVisible()
    await alert.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByText('The server refused the link', { exact: true })).toHaveCount(0)
  })
})
