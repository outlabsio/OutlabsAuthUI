import type { Page } from '@playwright/test'
import { expect, expectSeeded, persona, personaState, test } from '../support/fixtures'
import { cardByHeading } from '../support/entities'
import { apiUrl } from '../support/env'
import { jsonResponse } from '../support/mocks'
import { userDetailPath } from '../support/users'

// The user detail's Access tab beyond the grant cards (WP-13): the Effective permissions card
// with its source roles (F-013), Check access through the server's evaluator (F-059), a
// multi-role assign that reports each refusal (F-176), direct-role writes that never re-grant
// (F-015) and a deleted account that offers no access changes (F-174). Preset-agnostic unless
// a test says otherwise; every record is run-marked.

type RoleMembership = { id: string, role_id: string, status: string }

async function openAccess(page: Page, userId: string) {
  await page.goto(userDetailPath(userId, 'access'))
  await expect(page.getByRole('heading', { name: 'Direct roles', exact: true })).toBeVisible()
}

function permissionOption(page: Page, name: string) {
  return page.getByRole('option').filter({ has: page.locator('[data-slot="itemLabel"]', { hasText: new RegExp(`^${name}$`) }) })
}

test.describe('user access', () => {
  test.use({ errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, surfaces: ['users', 'roles'] })
  })

  test('effective permissions list each permission with the role that grants it, and search', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'access-effective' })
    const role = await api.createRole({ kind: 'access-effective', permissions: ['user:read', 'role:read'] })
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    const roleName = role.display_name ?? role.name

    await openAccess(page, user.id)
    const card = cardByHeading(page, 'Effective permissions')
    const rows = card.getByTestId('effective-permission')
    await expect(rows).toHaveCount(2)
    const userRead = card.getByRole('region', { name: 'user permissions' }).getByTestId('effective-permission')
    await expect(userRead).toContainText('read')
    // The source role is a chip with its name, and where it comes from.
    await expect(userRead.getByTestId('role-chip')).toHaveText(roleName)
    await expect(userRead).toContainText('direct assignment')

    // Search narrows by permission; a miss offers Clear search.
    const search = card.getByRole('searchbox', { name: 'Search effective permissions' })
    await search.fill('role:read')
    await expect(rows).toHaveCount(1)
    await search.fill('no-such-permission-here')
    await expect(card.getByText('No permission matches')).toBeVisible()
    await card.getByRole('button', { name: 'Clear search' }).click()
    await expect(rows).toHaveCount(2)
  })

  test('Check access answers per permission from the server', async ({ page, api, requires }) => {
    await requires({ surfaces: ['permissions'] })
    const user = await api.createUser({ kind: 'access-check' })
    const role = await api.createRole({ kind: 'access-check', permissions: ['user:read'] })
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    const checks: Array<Record<string, unknown>> = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().startsWith(apiUrl('/permissions/check'))) checks.push(request.postDataJSON() as Record<string, unknown>)
    })

    await openAccess(page, user.id)
    await cardByHeading(page, 'Effective permissions').getByRole('button', { name: 'Check access' }).click()
    const dialog = page.getByRole('dialog', { name: 'Check access' })
    await expect(dialog).toContainText(user.email)
    // Nothing chosen: the field says so.
    await dialog.getByRole('button', { name: 'Check access' }).click()
    await expect(dialog.getByText('Choose at least one permission.')).toBeVisible()

    await dialog.getByLabel('Permissions', { exact: true }).click()
    const search = page.getByRole('combobox', { name: 'Search permissions' })
    await search.fill('user:read')
    await permissionOption(page, 'user:read').click()
    await search.fill('user:delete')
    await permissionOption(page, 'user:delete').click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Check access' }).click()

    const results = dialog.getByTestId('check-access-results')
    await expect(results.getByRole('status')).toHaveText('Holds 1 of 2 across every entity')
    await expect(results.getByRole('listitem').filter({ hasText: 'user:read' })).toContainText('Allowed')
    await expect(results.getByRole('listitem').filter({ hasText: 'user:delete' })).toContainText('Denied')
    expect(checks).toEqual([{ user_id: user.id, permissions: ['user:read', 'user:delete'], entity_id: null }])
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()
  })

  test('a multi-role assign reports the role that failed and keeps only it selected (F-176)', async ({ page, api, errorGuard }) => {
    const user = await api.createUser({ kind: 'access-partial' })
    const ok = await api.createRole({ kind: 'access-partial-ok', permissions: [] })
    const refused = await api.createRole({ kind: 'access-partial-no', permissions: [] })
    const okName = ok.display_name ?? ok.name
    const refusedName = refused.display_name ?? refused.name
    errorGuard.allow({ status: 403, url: apiUrl(`/users/${user.id}/roles`) }, { kind: 'console', console: /status of 403/ })
    await page.route(url => url.pathname.endsWith(`/users/${user.id}/roles`) && !url.pathname.startsWith('/app/'), async (route) => {
      const body = route.request().postDataJSON() as { role_id?: string } | null
      if (route.request().method() === 'POST' && body?.role_id === refused.id) {
        return route.fulfill(jsonResponse(403, { detail: 'You cannot grant this role.' }))
      }
      return route.continue()
    })

    await openAccess(page, user.id)
    await page.getByRole('button', { name: 'Assign roles' }).click()
    const dialog = page.getByRole('dialog', { name: 'Assign roles' })
    const editor = dialog.getByTestId('role-access-editor')
    const searchRoles = editor.getByPlaceholder('Search roles...')
    await searchRoles.fill(okName)
    await editor.getByRole('option').filter({ hasText: okName }).click()
    await searchRoles.fill(refusedName)
    await editor.getByRole('option').filter({ hasText: refusedName }).click()
    await dialog.getByRole('button', { name: 'Assign roles' }).click()

    await expect(page.getByText('Assigned 1 of 2 roles').first()).toBeVisible()
    await expect(dialog).toBeVisible()
    await expect(dialog.getByTestId('api-error-alert')).toContainText(refusedName)
    const selection = editor.getByTestId('role-access-selection')
    await expect(selection.getByRole('button', { name: `Remove ${refusedName}` })).toBeVisible()
    await expect(selection.getByRole('button', { name: `Remove ${okName}` })).toHaveCount(0)
    const assigned = await api.get<RoleMembership[]>(`/users/${user.id}/role-memberships`)
    expect(assigned.map(m => m.role_id)).toEqual([ok.id])
  })

  test('an ended direct role offers only Reactivate; a suspended one is edited without re-sending its status (F-015)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'access-role-status' })
    const ended = await api.createRole({ kind: 'access-ended', permissions: [] })
    const paused = await api.createRole({ kind: 'access-paused', permissions: [] })
    await api.post(`/users/${user.id}/roles`, { role_id: ended.id })
    await api.delete(`/users/${user.id}/roles/${ended.id}`)
    await api.post(`/users/${user.id}/roles`, { role_id: paused.id })
    const all = await api.get<RoleMembership[]>(`/users/${user.id}/role-memberships`, { query: { include_inactive: true } })
    const pausedMembership = all.find(m => m.role_id === paused.id)!
    await api.patch(`/users/${user.id}/role-memberships/${pausedMembership.id}`, { status: 'suspended' })
    const endedName = ended.display_name ?? ended.name
    const pausedName = paused.display_name ?? paused.name
    const patches: Array<Record<string, unknown>> = []
    page.on('request', (request) => {
      if (request.method() === 'PATCH' && /\/role-memberships\/[^/]+$/.test(new URL(request.url()).pathname)) patches.push(request.postDataJSON() as Record<string, unknown>)
    })

    await openAccess(page, user.id)
    const card = cardByHeading(page, 'Direct roles')
    const pausedRow = card.getByRole('row').filter({ hasText: pausedName })
    await expect(pausedRow.getByText('Suspended', { exact: true })).toBeVisible()
    await expect(card.getByRole('row').filter({ hasText: endedName })).toHaveCount(0)

    // Assign roles never offers the suspended role (assigning it would quietly reactivate it and
    // drop its window); the revoked one can be assigned again.
    await page.getByRole('button', { name: 'Assign roles' }).click()
    const assign = page.getByRole('dialog', { name: 'Assign roles' })
    const editor = assign.getByTestId('role-access-editor')
    const searchRoles = editor.getByPlaceholder('Search roles...')
    await searchRoles.fill(endedName)
    await expect(editor.getByRole('option').filter({ hasText: endedName })).toBeVisible()
    await searchRoles.fill(pausedName)
    await expect(editor.getByRole('option').filter({ hasText: pausedName })).toHaveCount(0)
    await assign.getByRole('button', { name: 'Cancel' }).click()
    await expect(assign).toBeHidden()

    // Suspended: Edit assignment opens on Suspended; a window change sends only the window.
    await pausedRow.getByRole('button', { name: `Role actions for ${pausedName}` }).click()
    await page.getByRole('menuitem', { name: 'Edit assignment' }).click()
    const edit = page.getByRole('dialog', { name: 'Edit role assignment' })
    await expect(edit.getByLabel('Status', { exact: true })).toContainText('Suspended')
    await page.getByRole('dialog', { name: 'Edit role assignment' }).getByRole('group', { name: 'Valid until', exact: true }).getByRole('spinbutton').first().click()
    await page.keyboard.type('01152030')
    await edit.getByRole('button', { name: 'Save changes' }).click()
    await expect(edit).toBeHidden()
    expect(patches).toHaveLength(1)
    expect(Object.keys(patches[0]!)).toEqual(['valid_until'])

    // Ended (revoked): with Include ended, only Reactivate; it restores the assignment.
    await card.getByRole('checkbox', { name: 'Include ended' }).check()
    const endedRow = card.getByRole('row').filter({ hasText: endedName })
    await expect(endedRow.getByText('Revoked', { exact: true })).toBeVisible()
    await endedRow.getByRole('button', { name: `Role actions for ${endedName}` }).click()
    await expect(page.getByRole('menuitem', { name: 'Edit assignment' })).toHaveCount(0)
    await expect(page.getByRole('menuitem', { name: 'Remove' })).toHaveCount(0)
    await page.getByRole('menuitem', { name: 'Reactivate' }).click()
    const reactivate = page.getByRole('dialog', { name: `Reactivate role ${endedName}` })
    await expect(reactivate.getByTestId('reactivate-effects')).toContainText(`gets the permissions of ${endedName} again`)
    await reactivate.getByRole('button', { name: 'Reactivate role' }).click()
    await expect(reactivate).toBeHidden()
    expect(patches.at(-1)).toEqual({ status: 'active' })
    await expect(endedRow.getByText('Active', { exact: true })).toBeVisible()

    // Removing the suspended assignment ends it through its PATCH (DELETE answers 404 for it).
    await pausedRow.getByRole('button', { name: `Role actions for ${pausedName}` }).click()
    await page.getByRole('menuitem', { name: 'Remove' }).click()
    const confirm = page.getByRole('dialog', { name: `Remove role ${pausedName}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('suspended, so it grants nothing now')
    await confirm.getByRole('button', { name: 'Remove role' }).click()
    await expect(confirm).toBeHidden()
    expect(patches.at(-1)).toEqual({ status: 'revoked' })
  })

  test('a deleted account keeps its revoked grants on record and offers no access changes (F-174)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'access-deleted' })
    const role = await api.createRole({ kind: 'access-deleted', permissions: [] })
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    await api.delete(`/users/${user.id}`)
    const roleName = role.display_name ?? role.name

    await openAccess(page, user.id)
    const notice = page.getByTestId('user-deleted-access')
    await expect(notice).toContainText('This account is deleted')
    await expect(notice.getByRole('button', { name: 'Restore user' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Assign roles' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add membership' })).toHaveCount(0)
    // The delete revoked the assignment: listed with Include ended, with nothing to do on it.
    const card = cardByHeading(page, 'Direct roles')
    await card.getByRole('checkbox', { name: 'Include ended' }).check()
    await expect(card.getByRole('row').filter({ hasText: roleName }).getByText('Revoked', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: `Role actions for ${roleName}` })).toHaveCount(0)
  })
})

// A delegated organization admin (release-gating persona) on a colleague's Access tab: the
// effective permissions and memberships render from what the API lets them read, with names
// rather than ids and no refused request (strict guard).
test.describe('user access (delegated org admin)', () => {
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'], surfaces: ['users', 'memberships'] })
  })

  test('a colleague\'s effective permissions and memberships render without ids or refused requests', async ({ page, api, apiAs }) => {
    const target = await api.findUserByEmail(persona('agent').email)
    expectSeeded(target, 'the agent persona\'s account exists')
    const visible = await apiAs('orgAdmin').get(`/users/${target!.id}`, { allow: [404] })
    expectSeeded(visible, 'the agent persona belongs to the org admin\'s organization')

    await page.goto(userDetailPath(target!.id, 'access'))
    const effective = cardByHeading(page, 'Effective permissions')
    await expect(effective.getByTestId('effective-permission').first()).toBeVisible()
    const memberships = cardByHeading(page, 'Memberships')
    await expect(memberships.locator('tbody tr').first()).toBeVisible()
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/
    await expect(memberships).not.toContainText(uuid)
    await expect(effective).not.toContainText(uuid)
    await page.waitForLoadState('networkidle')
  })
})
