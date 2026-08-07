import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'

// Entity member management — add / edit-access / remove against the live backend. Memberships are
// scoped within a root org (the backend rejects cross-org adds), so this runs against the seeded
// ACME Realty root, where the picker (scoped to that org) offers real addable users. The roundtrip
// removes the member it adds, so it self-cleans. Payloads are asserted via route interception; the
// UI roundtrip (row appears → suspended → gone) is asserted through the refetched Users card.
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

test.describe('entity member management', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('adds, edits access for, and removes a member (roundtrip)', async ({ page }) => {
    const entityId = await acmeRootId()

    const posts: Array<Record<string, unknown>> = []
    const patches: Array<Record<string, unknown>> = []
    let deleted = false
    // POST /memberships/ (add). The 2-segment PATCH/DELETE endpoints and the details GET don't match.
    await page.route(/\/memberships\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    // PATCH/DELETE /memberships/{entityId}/{userId}
    await page.route(/\/memberships\/[^/]+\/[^/]+$/, async (route) => {
      const method = route.request().method()
      if (method === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      if (method === 'DELETE') deleted = true
      await route.continue()
    })

    await page.goto(`/app/entities?entity=${entityId}`)
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible()

    // --- Add member (an in-org user; roles left empty — see note below) ---
    // Roles are optional here on purpose: the role picker isn't yet scoped to "assignable at this
    // entity" (tracked as a refinement), so picking an arbitrary role could be a cross-org role the
    // backend rejects. The lifecycle doesn't need one. The user picker IS scoped to this org.
    await page.getByRole('button', { name: 'Add member' }).click()
    const addDialog = page.getByRole('dialog')
    await addDialog.locator('#add-member-user').click()
    // Scope to user options (they carry an email) — the role picker also renders role="option".
    const firstUser = page.getByRole('option').filter({ hasText: '@' }).first()
    const userLabel = ((await firstUser.textContent()) ?? '').trim()
    await firstUser.click()
    await addDialog.getByRole('button', { name: 'Add member' }).click()

    // Payload shape is correct...
    await expect.poll(() => posts.length).toBe(1)
    expect(posts[0]).toEqual(expect.objectContaining({ entity_id: entityId, status: 'active' }))
    expect(typeof posts[0]!.user_id).toBe('string')

    // ...and the member is now listed (the add dialog closes only on success).
    await expect(addDialog).toBeHidden()
    const email = userLabel.match(/\(([^)]+)\)/)?.[1] ?? userLabel
    const row = page.getByRole('row').filter({ hasText: email })
    await expect(row).toBeVisible()

    // --- Edit access: assign a role (keeps the membership active + listed, and exercises the role
    // picker; a suspend would hide the member from the active-only details view). Role options carry
    // a "perms" count chip, which distinguishes them from any other role="option". ---
    await row.getByRole('button', { name: 'Member actions' }).click()
    await page.getByRole('menuitem', { name: 'Edit access' }).click()
    const editDialog = page.getByRole('dialog')
    await editDialog.getByRole('option').filter({ hasText: 'perms' }).first().click()
    await editDialog.getByRole('button', { name: 'Save access' }).click()
    await expect.poll(() => patches.length).toBe(1)
    expect(patches[0]).toEqual(expect.objectContaining({ status: 'active' }))
    expect((patches[0]!.role_ids as string[]).length).toBeGreaterThan(0)
    await expect(editDialog).toBeHidden()

    // --- Remove the member (self-clean) ---
    await row.getByRole('button', { name: 'Member actions' }).click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
    await expect.poll(() => deleted).toBe(true)
    await expect(page.getByRole('row').filter({ hasText: email })).toHaveCount(0)
  })
})
