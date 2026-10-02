import { expect, test } from '../support/fixtures'
import { cardByHeading, openEntity } from '../support/entities'
import type { ApiClient } from '../support/api-client'
import type { Locator, Page } from '@playwright/test'
import { apiUrl } from '../support/env'
import { jsonResponse } from '../support/mocks'

// The entity's Users card: add / edit access / remove (AppFormDialog), the user search (users
// without an organisation included, F-011), the already-a-member check, and paging past one
// page with the true count (F-024). Everything runs on fresh run-marked entities and users.

async function addMembership(api: ApiClient, userId: string, entityId: string) {
  await api.post('/memberships/', { user_id: userId, entity_id: entityId, role_ids: [], status: 'active' })
}

async function setValidUntil(page: Page, dialog: Locator, typed: string) {
  await dialog.getByRole('group', { name: 'Valid until', exact: true }).getByRole('spinbutton').first().click()
  await page.keyboard.type(typed)
}

async function chooseUser(page: Page, email: string) {
  const dialog = page.getByRole('dialog', { name: 'Add member' })
  await dialog.getByLabel('User', { exact: true }).click()
  await page.getByRole('combobox', { name: 'Search users' }).fill(email)
  await page.getByRole('option').filter({ hasText: email }).click()
}

test.describe('entity member management', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, preset: 'EnterpriseRBAC', surfaces: ['entities', 'memberships'] })
  })

  test('adds, edits access for, and removes a member (roundtrip)', async ({ page, api }) => {
    // The seeded ACME organisation offers roles to assign; the member is a fresh run-marked user.
    const roots = await api.get<{ items: Array<{ id: string, display_name: string }> }>('/entities/', { query: { root_only: true, limit: 100 } })
    const acme = roots.items.find(e => e.display_name === 'ACME Realty')
    test.skip(!acme, 'The ACME Realty seed is not present.')
    // A fresh region inside ACME (its roles apply there), so the seeded organisation's own member
    // list is never touched.
    const entity = await api.createEntity({ kind: 'roundtrip', entity_type: 'region', parent_entity_id: acme!.id })
    const member = await api.createUser({ kind: 'member', root_entity_id: acme!.id })

    const posts: Array<Record<string, unknown>> = []
    const patches: Array<Record<string, unknown>> = []
    let deleted = false
    await page.route(/\/memberships\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await page.route(/\/memberships\/[^/]+\/[^/]+$/, async (route) => {
      const method = route.request().method()
      if (method === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      if (method === 'DELETE') deleted = true
      await route.continue()
    })

    await openEntity(page, entity.id, entity.display_name)
    await page.getByRole('button', { name: 'Add member' }).click()
    const addDialog = page.getByRole('dialog', { name: 'Add member' })
    await chooseUser(page, member.email)
    await addDialog.getByRole('button', { name: 'Add member' }).click()

    await expect(addDialog).toBeHidden()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(expect.objectContaining({ user_id: member.id, entity_id: entity.id, status: 'active', role_ids: [] }))
    const row = page.getByRole('row').filter({ hasText: member.email })
    await expect(row).toBeVisible()

    // Edit access: assign a role. Only what changed is sent (the role set).
    await row.getByRole('button', { name: /^Member actions for/ }).click()
    await page.getByRole('menuitem', { name: 'Edit access' }).click()
    const editDialog = page.getByRole('dialog', { name: `Edit access for ${member.email}` })
    await editDialog.getByRole('option').filter({ hasText: 'perms' }).first().click()
    await editDialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(editDialog).toBeHidden()
    expect(patches).toHaveLength(1)
    expect(Object.keys(patches[0]!)).toEqual(['role_ids'])

    // Remove (self-clean).
    await row.getByRole('button', { name: /^Member actions for/ }).click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    const confirm = page.getByRole('dialog', { name: `Remove ${member.email} from ${entity.display_name}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('stays in the user\'s history as revoked')
    await confirm.getByRole('button', { name: 'Remove member' }).click()
    await expect.poll(() => deleted).toBe(true)
    await expect(page.getByRole('row').filter({ hasText: member.email })).toHaveCount(0)
  })

  test('pages past one page and shows the true member count', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'many-members' })
    const users = []
    for (let i = 0; i < 27; i++) users.push(await api.createUser({ kind: `many-${i}`, root_entity_id: entity.id }))
    for (const user of users) await addMembership(api, user.id, entity.id)

    await openEntity(page, entity.id, entity.display_name)
    const card = cardByHeading(page, 'Users')
    await expect(card.getByText('Showing 1–25 of 27 members')).toBeVisible()
    await expect(card.locator('tbody > tr')).toHaveCount(25)
    await card.getByRole('navigation', { name: 'Members pages' }).getByRole('button', { name: 'Page 2' }).click()
    await expect(card.getByText('Showing 26–27 of 27 members')).toBeVisible()
    await expect(card.locator('tbody > tr')).toHaveCount(2)
  })

  test('flags a user who is already a member instead of overwriting the membership', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'dup-member' })
    const member = await api.createUser({ kind: 'dup', root_entity_id: entity.id })
    await addMembership(api, member.id, entity.id)
    let posted = false
    await page.route(/\/memberships\/?$/, async (route) => {
      if (route.request().method() === 'POST') posted = true
      await route.continue()
    })

    await openEntity(page, entity.id, entity.display_name)
    await page.getByRole('button', { name: 'Add member' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add member' })
    await chooseUser(page, member.email)
    await expect(dialog.getByText('Already a member here (active). Use Edit access on their row instead.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Add member' })).toBeDisabled()
    expect(posted).toBe(false)
  })

  test('finds users without an organisation (their first membership places them)', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'first-org' })
    const loose = await api.createUser({ kind: 'no-org' })
    await openEntity(page, entity.id, entity.display_name)
    await page.getByRole('button', { name: 'Add member' }).click()
    await page.getByRole('dialog', { name: 'Add member' }).getByLabel('User', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Search users' }).fill(loose.email)
    const option = page.getByRole('option').filter({ hasText: loose.email })
    await expect(option).toContainText('No organization yet')
  })
  test('an ended member offers only Reactivate, which restores the membership (F-015)', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'reactivate-member' })
    const member = await api.createUser({ kind: 'reactivate-member', root_entity_id: entity.id })
    await addMembership(api, member.id, entity.id)
    await api.delete(`/memberships/${entity.id}/${member.id}`)
    const patches: Array<Record<string, unknown>> = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith(`/memberships/${entity.id}/${member.id}`)) patches.push(request.postDataJSON() as Record<string, unknown>)
    })

    await openEntity(page, entity.id, entity.display_name)
    const card = cardByHeading(page, 'Users')
    await card.getByRole('switch', { name: 'Include inactive' }).click()
    const row = card.getByRole('row').filter({ hasText: member.email })
    await expect(row.getByText('Revoked', { exact: true })).toBeVisible()
    await row.getByRole('button', { name: /^Member actions for/ }).click()
    await expect(page.getByRole('menuitem', { name: 'Edit access' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Remove' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Reactivate' }).click()

    const dialog = page.getByRole('dialog', { name: `Reactivate membership in ${entity.display_name}` })
    await expect(dialog.getByTestId('reactivate-effects')).toContainText('carries no roles')
    await dialog.getByRole('button', { name: 'Reactivate membership' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ status: 'active' }])
    await expect(row.getByText('Active', { exact: true })).toBeVisible()
  })
  test('Edit access re-reads through the entity list when the user\'s memberships cannot be read, and never saves unchecked (F-015)', async ({ page, api, errorGuard }) => {
    const entity = await api.createEntity({ kind: 'reread-member' })
    const member = await api.createUser({ kind: 'reread-member', root_entity_id: entity.id })
    await addMembership(api, member.id, entity.id)
    // An entity-scoped admin may not read every membership the user has: that read is refused.
    const userMemberships = apiUrl(`/memberships/user/${member.id}`)
    errorGuard.allow({ status: 403, url: userMemberships }, { kind: 'console', console: /status of 403/ })
    await page.route(url => url.pathname.endsWith(`/memberships/user/${member.id}`), route => route.fulfill(jsonResponse(403, { detail: 'Not allowed.' })))
    const patches: Array<Record<string, unknown>> = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith(`/memberships/${entity.id}/${member.id}`)) patches.push(request.postDataJSON() as Record<string, unknown>)
    })

    await openEntity(page, entity.id, entity.display_name)
    const row = cardByHeading(page, 'Users').getByRole('row').filter({ hasText: member.email })
    const dialog = page.getByRole('dialog', { name: `Edit access for ${member.email}` })

    // The entity's own list confirms the membership is still live: the change is saved.
    await row.getByRole('button', { name: /^Member actions for/ }).click()
    await page.getByRole('menuitem', { name: 'Edit access' }).click()
    await setValidUntil(page, dialog, '01152030')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(patches).toHaveLength(1)
    expect(Object.keys(patches[0]!)).toEqual(['valid_until'])

    // Ended meanwhile: the list no longer shows it, so the dialog says it cannot confirm the
    // membership and sends nothing.
    await row.getByRole('button', { name: /^Member actions for/ }).click()
    await page.getByRole('menuitem', { name: 'Edit access' }).click()
    await api.delete(`/memberships/${entity.id}/${member.id}`)
    await setValidUntil(page, dialog, '01162030')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByTestId('api-error-alert')).toContainText('Could not confirm the current membership')
    expect(patches).toHaveLength(1)
  })
})
