import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'

// User-side membership management: add the user to an entity, then remove. Seeds a pw- user directly
// in ACME's org (root_entity_id) so ACME sub-entities are addable; the pw- user is purged by the
// cleanup teardown, and the roundtrip removes the membership it adds.
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

async function acmeRootId(): Promise<string> {
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/entities/?limit=100`, {
    headers: { Authorization: `Bearer ${adminAccessToken()}` }
  })
  if (!res.ok) throw new Error(`List entities failed: ${res.status}`)
  const data = await res.json() as { items?: Array<{ id: string, display_name: string }> }
  const acme = (data.items ?? []).find(e => e.display_name === 'ACME Realty')
  if (!acme) throw new Error('ACME Realty seed not found')
  return acme.id
}

async function createUserInOrg(rootId: string): Promise<{ id: string }> {
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/users/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}` },
    body: JSON.stringify({ email: `pw-mem-${stamp}@example.com`, password: 'Testpass1!', root_entity_id: rootId })
  })
  if (!res.ok) throw new Error(`Seed user failed: ${res.status} ${await res.text()}`)
  return res.json() as Promise<{ id: string }>
}

test.describe('user membership management', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('adds then removes an entity membership', async ({ page }) => {
    const rootId = await acmeRootId()
    const user = await createUserInOrg(rootId)

    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    const posts: Array<Record<string, unknown>> = []
    let deleted = false
    await page.route(/\/memberships\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await page.route(/\/memberships\/[^/]+\/[^/]+$/, async (route) => {
      if (route.request().method() === 'DELETE') deleted = true
      await route.continue()
    })

    await page.goto(`/app/users/${user.id}`)
    await expect(page.getByRole('heading', { name: 'Memberships' })).toBeVisible()

    // --- Add membership (roles left empty; entity options carry no "perms" chip, unlike roles) ---
    await page.getByRole('button', { name: 'Add membership' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.locator('#add-membership-entity').click()
    const firstEntity = page.getByRole('option').filter({ hasNotText: 'perms' }).first()
    const entityLabel = ((await firstEntity.textContent()) ?? '').trim()
    await firstEntity.click()
    await dialog.getByRole('button', { name: 'Add membership' }).click()

    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toEqual(expect.objectContaining({ user_id: user.id, status: 'active' }))
    expect(typeof posts[0]!.entity_id).toBe('string')
    await expect(dialog).toBeHidden()

    const row = page.getByRole('row').filter({ hasText: entityLabel })
    await expect(row).toBeVisible()

    // --- Remove it ---
    await row.getByRole('button', { name: 'Membership actions' }).click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect.poll(() => deleted).toBe(true)
    await expect(page.getByRole('row').filter({ hasText: entityLabel })).toHaveCount(0)

    const realErrors = consoleErrors.filter(e => /defaultPlaceholder|is not a function|is not defined|Cannot read/i.test(e))
    expect(realErrors, realErrors.join('\n')).toHaveLength(0)
  })
})
