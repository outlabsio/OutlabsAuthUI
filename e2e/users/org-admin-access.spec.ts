import type { Page } from '@playwright/test'
import { expect, expectSeeded, personaState, personaToken, requireBackend, test } from '../support/fixtures'
import { apiGet } from '../support/capabilities'

// F-002 regression: a delegated organisation admin holds tree-scoped grants
// (membership:read_tree, entity:read_tree, ...) rather than the bare names. The console must
// apply the backend permission algebra, so the user Memberships card and the entity Users card
// render the data the API returns — not "Not a member of any entity" or a lock.

type Me = { id: string, email: string, root_entity_id: string | null, root_entity_name: string | null }
type Membership = { entity_id: string }
type Member = { user_id: string, email: string }

// The UCard whose header holds the given h2 (its nearest data-slot="root" ancestor).
function cardByHeading(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true }).locator('xpath=ancestor::*[@data-slot="root"][1]')
}

test.describe('delegated org admin (EnterpriseRBAC)', () => {
  test.use({ storageState: personaState('orgAdmin') })

  let me: Me
  let token: string

  test.beforeEach(async () => {
    await requireBackend({ personas: ['orgAdmin'], surfaces: ['entities'] })
    token = personaToken('orgAdmin')
    me = await apiGet<Me>('/users/me', token)
  })

  test('user detail Memberships card renders the memberships the API returns', async ({ page }) => {
    const memberships = await apiGet<Membership[]>(`/memberships/user/${me.id}`, token)
    expect(memberships.length, 'seed: the org admin belongs to their organisation').toBeGreaterThan(0)

    await page.goto(`/app/users/${me.id}?tab=access`)
    const card = cardByHeading(page, 'Memberships')
    await expect(card.getByRole('heading', { name: 'Memberships', exact: true })).toBeVisible()
    await expect(card.getByText('Not a member of any entity.')).toHaveCount(0)
    await expect(card.getByRole('heading', { name: /^No access to / })).toHaveCount(0)
    await expect(card.locator('tbody > tr')).toHaveCount(memberships.length)
    if (me.root_entity_name) await expect(card.getByText(me.root_entity_name).first()).toBeVisible()
  })

  test('entity detail Users card lists the members instead of a lock', async ({ page }) => {
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const members = await apiGet<Member[]>(`/memberships/entity/${me.root_entity_id}/details`, token)
    expect(members.length, 'seed: the organisation has active members').toBeGreaterThan(0)

    await page.goto(`/app/entities?entity=${me.root_entity_id}`)
    const card = cardByHeading(page, 'Users')
    await expect(card.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
    await expect(card.getByRole('heading', { name: /^No access to / })).toHaveCount(0)
    await expect(card.getByRole('heading', { name: 'No active members' })).toHaveCount(0)
    // Rows render (the exact count is not compared: parallel specs add members to this seeded
    // organisation; e2e/entities/entity-members.spec.ts checks counts on its own entity).
    await expect(card.locator('tbody > tr').first()).toBeVisible()
    // Member names link to the user detail (the org admin holds user:read).
    await expect(card.getByRole('link').first()).toBeVisible()
  })

  test('actions follow the delegated grants', async ({ page }) => {
    // user:create -> Add user; the Entities toolbar and Users list render (read gates pass).
    await page.goto('/app/users')
    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
    // No membership:create -> no Add membership on the user detail.
    await page.goto(`/app/users/${me.id}?tab=access`)
    await expect(page.getByRole('heading', { name: 'Memberships', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add membership' })).toHaveCount(0)
  })
})
