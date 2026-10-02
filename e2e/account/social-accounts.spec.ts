import type { Page } from '@playwright/test'
import { backendConfigured, expect, test } from '../support/fixtures'
import { withExtraSurfaces, withoutSurfaces } from '../support/capabilities'
import { appOrigin } from '../support/env'

// Connected social accounts on Account (gap-backlog #1, F-094, F-194). Authenticated project
// (admin storageState). The associate redirect loop is exercised with an intercepted authorize
// response — a real provider roundtrip needs live client secrets (manual checklist). Linked
// accounts are served from a mocked list, so the persona's record is never changed.

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
  await page.addInitScript((key) => {
    ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
      ...(key ? { frontendProfileKey: key } : {}),
      authUi: { oauthProviders: ['google'] }
    }
  }, frontendProfileKey)
}

// One linked account; DELETE answers with `deleteStatus` (204 unlinks it).
async function withLinkedAccount(page: Page, deleteStatus = 204) {
  let linked = [LINKED]
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
