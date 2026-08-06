import { backendConfigured, expect, test } from '../support/fixtures'
import type { Page } from '@playwright/test'

// Personal API keys — full self-service lifecycle (chromium project, admin storageState).
// Create + rotate surface the one-time secret; revoke soft-deletes (the row stays as revoked).
const SCOPE = 'entity:read'

async function mintKey(page: Page, name: string) {
  await page.goto('/app/api-keys')
  await page.getByRole('button', { name: 'Create API key' }).click()
  await expect(page.getByText('Create personal API key')).toBeVisible()
  await page.locator('#api-key-name').fill(name)
  await page.getByRole('checkbox', { name: SCOPE, exact: true }).check()
  await page.getByRole('button', { name: 'Create key' }).click()
  await expect(page.getByText('Store the new API key now')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
}

function keyRow(page: Page, name: string) {
  return page.getByRole('row').filter({ hasText: name })
}

test.describe('api keys workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders the API keys workspace', async ({ page }) => {
    await page.goto('/app/api-keys')
    await expect(page.getByRole('heading', { name: 'API Keys' })).toBeVisible()
    await expect(page.getByRole('table')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Create API key' })).toBeVisible()
  })

  test('mint surfaces the one-time secret and lists the new key', async ({ page }) => {
    const name = `pw-mint-${Date.now()}`
    await page.goto('/app/api-keys')
    await page.getByRole('button', { name: 'Create API key' }).click()

    await expect(page.getByText('Create personal API key')).toBeVisible()
    await page.locator('#api-key-name').fill(name)
    await page.getByRole('checkbox', { name: SCOPE, exact: true }).check()
    await page.getByRole('button', { name: 'Create key' }).click()

    // The plaintext secret is shown exactly once.
    await expect(page.getByText('Store the new API key now')).toBeVisible()
    await expect(page.getByLabel('API key secret')).not.toHaveValue('')
    await page.getByRole('button', { name: 'Done' }).click()

    await expect(keyRow(page, name)).toBeVisible()
  })

  test('mint sends the personal-key payload', async ({ page }) => {
    const name = `pw-payload-${Date.now()}`
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/api-keys\/?$/, async (route) => {
      if (route.request().method() === 'POST') {
        posts.push(route.request().postDataJSON() as Record<string, unknown>)
      }
      await route.continue()
    })

    await mintKey(page, name)

    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(
      expect.objectContaining({
        name,
        scopes: [SCOPE],
        key_kind: 'personal',
        rate_limit_per_minute: 60
      })
    )
  })

  test('rotate issues a fresh one-time secret', async ({ page }) => {
    const name = `pw-rotate-${Date.now()}`
    await mintKey(page, name)

    await keyRow(page, name).getByRole('button', { name: 'API key actions' }).click()
    await page.getByRole('menuitem', { name: 'Rotate' }).click()
    await expect(page.getByText('Rotate API key')).toBeVisible()
    await page.getByRole('button', { name: 'Rotate key' }).click()

    await expect(page.getByText('Store the new API key now')).toBeVisible()
    await expect(page.getByLabel('API key secret')).not.toHaveValue('')
    await page.getByRole('button', { name: 'Done' }).click()
  })

  test('revoke marks the key revoked', async ({ page }) => {
    const name = `pw-revoke-${Date.now()}`
    await mintKey(page, name)

    await keyRow(page, name).getByRole('button', { name: 'API key actions' }).click()
    await page.getByRole('menuitem', { name: 'Revoke' }).click()
    await expect(page.getByText('Revoke API key')).toBeVisible()
    await page.getByRole('button', { name: 'Revoke key' }).click()

    await expect(keyRow(page, name).getByText('revoked')).toBeVisible()
  })

  test('the unlimited switch zeroes and disables the rate limit', async ({ page }) => {
    await page.goto('/app/api-keys')
    await page.getByRole('button', { name: 'Create API key' }).click()

    const rate = page.locator('#api-key-rate-limit')
    await expect(rate).toHaveValue('60')
    await page.getByRole('switch', { name: 'Use unlimited rate limit' }).click()
    await expect(rate).toBeDisabled()
    await expect(rate).toHaveValue('0')
  })
})
