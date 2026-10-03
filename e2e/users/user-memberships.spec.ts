import type { Page } from '@playwright/test'
import { expect, expectSeeded, personaState, test, type ApiClient } from '../support/fixtures'
import { cardByHeading } from '../support/entities'
import { apiUrl } from '../support/env'
import { jsonResponse } from '../support/mocks'
import { typeDay } from '../support/date-field'
import { userDetailPath } from '../support/users'

// The user detail's Memberships card (EnterpriseRBAC with the memberships router): add and
// remove, the full membership picture (live by default, Include ended for the rest, F-058),
// writes that never re-grant revoked access (F-015), Reactivate, a first membership for a user
// without an organization (F-011) and entity names for inactive entities (F-066). Every record
// is run-marked (api.create*), so the cleanup teardown removes it.

type Membership = { entity_id: string, status: string, valid_until: string | null }

const membershipPatches = (page: Page) => {
  const bodies: Array<Record<string, unknown>> = []
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && /\/memberships\/[^/]+\/[^/]+$/.test(new URL(request.url()).pathname) && !request.url().includes('/app/')) {
      bodies.push(request.postDataJSON() as Record<string, unknown>)
    }
  })
  return bodies
}

async function membershipOf(api: ApiClient, userId: string, entityId: string): Promise<Membership | undefined> {
  const all = await api.get<Membership[]>(`/memberships/user/${userId}`, { query: { include_inactive: true, limit: 100 } })
  return all.find(m => m.entity_id === entityId)
}

async function openRowMenu(page: Page, entityName: string) {
  await cardByHeading(page, 'Memberships').getByRole('button', { name: `Membership actions for ${entityName}`, exact: true }).click()
}

test.describe('user memberships', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, preset: 'EnterpriseRBAC', surfaces: ['memberships', 'entities'] })
  })

  test('adds then removes an entity membership', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'mem-root' })
    const office = await api.createEntity({ kind: 'mem-office', entity_type: 'office', parent_entity_id: root.id })
    const user = await api.createUser({ kind: 'mem-roundtrip', root_entity_id: root.id })

    const posts: Array<Record<string, unknown>> = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().startsWith(apiUrl('/memberships/'))) posts.push(request.postDataJSON() as Record<string, unknown>)
    })

    await page.goto(userDetailPath(user.id, 'access'))
    const card = cardByHeading(page, 'Memberships')
    await expect(card.getByRole('heading', { name: 'Memberships', exact: true })).toBeVisible()

    await card.getByRole('button', { name: 'Add membership' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add membership' })
    // Nothing chosen: the Entity field says so.
    await dialog.getByRole('button', { name: 'Add membership' }).click()
    await expect(dialog.getByText('Choose an entity.')).toBeVisible()
    await dialog.getByLabel('Entity', { exact: true }).click()
    await page.getByRole('option').filter({ has: page.locator('[data-slot="itemLabel"]', { hasText: office.display_name }) }).click()
    await dialog.getByRole('button', { name: 'Add membership' }).click()
    await expect(dialog).toBeHidden()
    expect(posts).toEqual([expect.objectContaining({ user_id: user.id, entity_id: office.id, status: 'active', role_ids: [] })])

    const row = card.getByRole('row').filter({ hasText: office.display_name })
    await expect(row).toBeVisible()
    await expect(row.getByText('Active', { exact: true })).toBeVisible()

    await openRowMenu(page, office.display_name)
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    const confirm = page.getByRole('dialog', { name: `Remove membership in ${office.display_name}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('not affected')
    await confirm.getByRole('button', { name: 'Remove membership' }).click()
    await expect(confirm).toBeHidden()
    // Removed is ended: hidden by default, listed (revoked) with Include ended.
    await expect(row).toHaveCount(0)
    await card.getByRole('checkbox', { name: 'Include ended' }).check()
    await expect(row.getByText('Revoked', { exact: true })).toBeVisible()
    expect((await membershipOf(api, user.id, office.id))?.status).toBe('revoked')
  })

  test('suspended memberships stay listed; revoked ones show with Include ended and offer only Reactivate', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'mem-status-root' })
    const kept = await api.createEntity({ kind: 'mem-suspended', entity_type: 'office', parent_entity_id: root.id })
    const gone = await api.createEntity({ kind: 'mem-revoked', entity_type: 'office', parent_entity_id: root.id })
    const user = await api.createUser({ kind: 'mem-status', root_entity_id: root.id })
    await api.post('/memberships/', { user_id: user.id, entity_id: kept.id, role_ids: [], status: 'suspended' })
    await api.post('/memberships/', { user_id: user.id, entity_id: gone.id, role_ids: [] })
    await api.delete(`/memberships/${gone.id}/${user.id}`)

    await page.goto(userDetailPath(user.id, 'access'))
    const card = cardByHeading(page, 'Memberships')
    const suspended = card.getByRole('row').filter({ hasText: kept.display_name })
    const revoked = card.getByRole('row').filter({ hasText: gone.display_name })
    await expect(suspended.getByText('Suspended', { exact: true })).toBeVisible()
    await expect(revoked).toHaveCount(0)

    await card.getByRole('checkbox', { name: 'Include ended' }).check()
    await expect(revoked.getByText('Revoked', { exact: true })).toBeVisible()

    // An ended membership is never opened in a form that would save "Active" (F-015).
    await openRowMenu(page, gone.display_name)
    await expect(page.getByRole('menuitem', { name: 'Reactivate' })).toBeVisible()
    await expect(page.getByRole('menuitem', { name: 'Edit access' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Remove' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    // A suspended one offers all three.
    await openRowMenu(page, kept.display_name)
    for (const item of ['Reactivate', 'Edit access', 'Remove']) await expect(page.getByRole('menuitem', { name: item })).toBeVisible()
    await page.keyboard.press('Escape')
  })

  test('editing a suspended membership\'s window sends only the window; its status stays suspended', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'mem-edit-root' })
    const office = await api.createEntity({ kind: 'mem-edit', entity_type: 'office', parent_entity_id: root.id })
    const user = await api.createUser({ kind: 'mem-edit', root_entity_id: root.id })
    await api.post('/memberships/', { user_id: user.id, entity_id: office.id, role_ids: [], status: 'suspended' })
    const patches = membershipPatches(page)

    await page.goto(userDetailPath(user.id, 'access'))
    await openRowMenu(page, office.display_name)
    await page.getByRole('menuitem', { name: 'Edit access' }).click()
    const dialog = page.getByRole('dialog', { name: `Edit membership in ${office.display_name}` })
    // The real status, not a default.
    await expect(dialog.getByLabel('Status', { exact: true })).toContainText('Suspended')
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await typeDay(page, 'Valid until', '2030-01-15')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()

    expect(patches).toHaveLength(1)
    expect(Object.keys(patches[0]!)).toEqual(['valid_until'])
    expect((await membershipOf(api, user.id, office.id))?.status).toBe('suspended')
  })

  test('Reactivate states its effects, clears a passed end date and restores the membership', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'mem-react-root' })
    const office = await api.createEntity({ kind: 'mem-react', entity_type: 'office', parent_entity_id: root.id })
    const user = await api.createUser({ kind: 'mem-react', root_entity_id: root.id })
    await api.post('/memberships/', { user_id: user.id, entity_id: office.id, role_ids: [], valid_until: '2026-01-01T02:59:59.999Z' })
    await api.delete(`/memberships/${office.id}/${user.id}`)
    const patches = membershipPatches(page)

    await page.goto(userDetailPath(user.id, 'access'))
    const card = cardByHeading(page, 'Memberships')
    await card.getByRole('checkbox', { name: 'Include ended' }).check()
    await openRowMenu(page, office.display_name)
    await page.getByRole('menuitem', { name: 'Reactivate' }).click()
    const dialog = page.getByRole('dialog', { name: `Reactivate membership in ${office.display_name}` })
    const effects = dialog.getByTestId('reactivate-effects')
    await expect(effects).toContainText('carries no roles')
    await expect(effects).toContainText('has passed, so it is cleared')
    await dialog.getByLabel('Reason').fill('Back from leave')
    await dialog.getByRole('button', { name: 'Reactivate membership' }).click()
    await expect(dialog).toBeHidden()

    expect(patches).toEqual([{ status: 'active', valid_until: null, reason: 'Back from leave' }])
    const after = await membershipOf(api, user.id, office.id)
    expect(after?.status).toBe('active')
    expect(after?.valid_until).toBeNull()
    await card.getByRole('checkbox', { name: 'Include ended' }).uncheck()
    await expect(card.getByRole('row').filter({ hasText: office.display_name }).getByText('Active', { exact: true })).toBeVisible()
  })

  test('a user without an organization gets a first membership, which places them in it (F-011)', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'mem-first-root' })
    const office = await api.createEntity({ kind: 'mem-first', entity_type: 'office', parent_entity_id: root.id })
    const user = await api.createUser({ kind: 'mem-first' })
    expect(user.root_entity_id ?? null).toBeNull()

    await page.goto(userDetailPath(user.id, 'access'))
    await cardByHeading(page, 'Memberships').getByRole('button', { name: 'Add membership' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add membership' })
    await expect(dialog.getByText('belongs to no organization yet')).toBeVisible()
    // A superuser searches every entity on the server.
    await dialog.getByLabel('Entity', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Search entities' }).pressSequentially(office.display_name, { delay: 20 })
    await page.getByRole('option').filter({ has: page.locator('[data-slot="itemLabel"]', { hasText: office.display_name }) }).first().click()
    await dialog.getByRole('button', { name: 'Add membership' }).click()
    await expect(dialog).toBeHidden()

    await expect(cardByHeading(page, 'Memberships').getByRole('row').filter({ hasText: office.display_name })).toBeVisible()
    const placed = await api.get<{ root_entity_id: string | null }>(`/users/${user.id}`)
    expect(placed.root_entity_id).toBe(root.id)
  })

  test('a membership in an inactive entity shows the entity\'s name and an Inactive badge (F-066)', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'mem-inactive-root' })
    const office = await api.createEntity({ kind: 'mem-inactive', entity_type: 'office', parent_entity_id: root.id })
    const user = await api.createUser({ kind: 'mem-inactive', root_entity_id: root.id })
    const role = await api.createRole({ kind: 'mem-inactive', permissions: ['user:read'] })
    await api.post('/memberships/', { user_id: user.id, entity_id: office.id, role_ids: [role.id] })
    await api.patch(`/entities/${office.id}`, { status: 'inactive' })

    await page.goto(userDetailPath(user.id, 'access'))
    const row = cardByHeading(page, 'Memberships').getByRole('row').filter({ hasText: office.display_name })
    await expect(row).toBeVisible()
    await expect(row.getByText('Entity inactive', { exact: true })).toBeVisible()
    await expect(row.getByText(office.id)).toHaveCount(0)
    // Effective permissions names the same entity as where the role comes from, marked inactive
    // (an inactive entity does not revoke the access its memberships grant).
    const permission = cardByHeading(page, 'Effective permissions').getByTestId('effective-permission').filter({ has: page.getByTestId('role-chip').filter({ hasText: role.display_name ?? role.name }) })
    await expect(permission.first()).toContainText(`${office.display_name} (inactive)`)
    await expect(permission.first()).not.toContainText('an entity')
  })
})

test.describe('user memberships as a delegated organization admin', () => {
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, preset: 'EnterpriseRBAC', personas: ['orgAdmin'], surfaces: ['memberships', 'entities'] })
  })

  test('a membership role the admin cannot read is named by the membership itself, never "Unknown role" (F-067)', async ({ page, api, apiAs }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    // A system-wide role: outside a delegated admin's role catalog (GET /roles/ is scope-filtered).
    const role = await api.createRole({ kind: 'mem-sw', is_global: true, permissions: ['user:read'] })
    const user = await api.createUser({ kind: 'mem-sw', root_entity_id: me.root_entity_id })
    await api.post('/memberships/', { user_id: user.id, entity_id: me.root_entity_id, role_ids: [role.id] })
    // The membership history would name the role too (its own role_names): served empty, so the
    // membership's own name is all that is left.
    await page.route(new RegExp(`/users/${user.id}/membership-history(\\?.*)?$`), route => route.fulfill(jsonResponse(200, { items: [], total: 0, page: 1, limit: 10, pages: 0 })))

    await page.goto(userDetailPath(user.id, 'access'))
    const card = cardByHeading(page, 'Memberships')
    const row = card.getByRole('row').filter({ hasText: me.root_entity_name ?? '' })
    await expect(row.getByTestId('role-chip')).toHaveText(role.name)
    await expect(card.getByTestId('role-chip').filter({ hasText: /Unknown role|Loading role/ })).toHaveCount(0)
  })
})
