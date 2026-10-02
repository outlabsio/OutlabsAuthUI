import { backendConfigured, expect, test } from '../support/fixtures'

// Invite user by email (POST /auth/invite). The invited account (INVITED status) is run-marked and
// purged by the cleanup teardown. Minimal path — email only; entity/roles are optional
// attachments for a global admin.
test.describe('user invite', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('invites a user by email and opens the invited account', async ({ page, requires, testData }) => {
    await requires({ features: ['invitations'] })
    const email = testData.email('invite')

    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/auth\/invite$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByRole('button', { name: 'Send invite' }).click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toEqual(expect.objectContaining({ email, is_superuser: false }))
    expect(posts[0]!.entity_id).toBeUndefined()
    await expect(dialog).toBeHidden()

    // The new account (status Invited) opens instead of hiding behind the Active filter (F-060).
    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: email })).toBeVisible()
    await expect(page.getByText('Invited', { exact: true }).first()).toBeVisible()
  })
})
