import { backendConfigured, expect, test } from '../support/fixtures'
import { chooseSelect } from '../support/ui-select'

// Invite user by email (POST /auth/invite). The invited pw- account (INVITED status) is purged by the
// cleanup teardown. Minimal path — email only; entity/roles are optional attachments.
test.describe('user invite', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('invites a user by email', async ({ page }) => {
    const email = `pw-invite-${Date.now()}@example.com`

    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/auth\/invite$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Invite' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByRole('button', { name: 'Send invite' }).click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toEqual(expect.objectContaining({ email }))
    await expect(dialog).toBeHidden()

    // The new account has INVITED status — reach it via the status filter, then confirm it's listed.
    await chooseSelect(page, 'user-status-filter', 'Invited')
    await page.getByPlaceholder('Search users...').fill(email)
    await expect(page.getByRole('row').filter({ hasText: email })).toBeVisible()
  })
})
