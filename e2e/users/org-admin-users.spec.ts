import type { Page } from '@playwright/test'
import { backendConfigured, expect, expectSeeded, persona, personaState, test, type ApiClient } from '../support/fixtures'
import { cardByHeading } from '../support/entities'
import { searchUsersList } from '../support/lists'
import { onPath } from '../support/session'
import { userActionsButton, userDetailPath } from '../support/users'

// A delegated organisation admin on the users list (F-012, F-053, F-054, F-161): the persona
// holds user:read/create/update and membership:create_tree but not user:delete, and has no
// global scope. Accounts they create or invite stay in their organisation (and in their list),
// and they are never offered what the backend refuses them.

test.describe('users list as a delegated organisation admin', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'] })
  })

  async function openAddUser(page: Page) {
    await page.goto('/app/users')
    await page.getByRole('button', { name: 'Add user' }).click()
    return page.getByRole('dialog', { name: 'Add user' })
  }

  test('Add user places the account in their organization; it opens and stays in their list (F-012, F-054)', async ({ page, apiAs, testData }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const posts: Array<Record<string, unknown>> = []
    await page.route(/\/users\/?$/, async (route) => {
      if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.fallback()
    })

    const dialog = await openAddUser(page)
    // Organization: required, preselected, and their own only. No superuser option.
    const organization = dialog.getByLabel('Organization', { exact: true })
    await expect(organization).toContainText((me as { root_entity_name?: string }).root_entity_name ?? '')
    await expect(dialog.getByText('Accounts you create belong to your organization')).toBeVisible()
    await expect(dialog.getByRole('switch', { name: 'Superuser' })).toHaveCount(0)
    await expect(dialog.getByText('Superuser')).toHaveCount(0)
    await organization.click()
    await expect(page.getByRole('option')).toHaveCount(1)
    await page.keyboard.press('Escape')
    // The menu hands the focus back to its trigger as it closes; type only after that.
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await expect(organization).toBeFocused()

    const email = testData.email('org-created')
    await dialog.getByLabel('Email').fill(email)
    await dialog.getByLabel('Initial password').fill('Testpass1!')
    await dialog.getByLabel('Confirm password').fill('Testpass1!')
    await dialog.getByRole('button', { name: 'Create user' }).click()

    // The new account opens (not "not found": it is inside their scope)...
    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+$/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('heading', { name: email })).toBeVisible()
    expect(posts).toEqual([expect.objectContaining({ email, root_entity_id: me.root_entity_id, is_superuser: false })])
    // ...and is in their list.
    await page.goto('/app/users')
    await searchUsersList(page, email)
  })

  test('row menus offer only what they may do: View, Edit, and their own account (F-053, F-063)', async ({ page }) => {
    // Another account in their organization: user:update but no user:delete, so no Delete.
    const other = persona('agent').email
    await page.goto('/app/users')
    await searchUsersList(page, other)
    await page.getByRole('button', { name: `User actions for ${other}` }).click()
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['View', 'Edit profile'])
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)

    const own = persona('orgAdmin').email
    await searchUsersList(page, own)
    await page.getByRole('button', { name: `User actions for ${own}` }).click()
    await expect(page.getByRole('menu').getByRole('menuitem')).toHaveText(['View', 'Your account', 'Edit profile'])
    await page.getByRole('menuitem', { name: 'Your account' }).click()
    await expect(page).toHaveURL(onPath('/app/account'))
  })

  test('their organization\'s orphans, no organization filter, and Invite joins an entity of theirs (F-012, F-161, F-171)', async ({ page }) => {
    await page.goto('/app/users')
    await expect(page.getByRole('button', { name: 'Add user' })).toBeVisible()
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.getByLabel('Filter by organization', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Organization' })).toHaveCount(0)
    // The orphaned list holds the orphans rooted in their organization (the seed's orphan lost
    // its only membership), never another organization's.
    await page.getByRole('checkbox', { name: 'Orphaned only' }).check()
    await expect(page).toHaveURL(/[?&]orphaned=true/)
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.locator('tbody tr').filter({ hasText: /@summit\.com/ })).toHaveCount(0)
    await page.getByPlaceholder('Search users...').fill('orphan@acme.com')
    await expect(page.locator('tbody tr').filter({ hasText: 'orphan@acme.com' })).toHaveCount(1)
    await page.getByPlaceholder('Search users...').fill('')
    await page.getByRole('checkbox', { name: 'Orphaned only' }).uncheck()
    // An invite needs membership:create_tree, and must name the entity it joins: an account
    // invited without one would be created outside their view.
    await page.getByRole('button', { name: 'Invite', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: 'Invite user' })
    await expect(dialog.getByText('The account joins this entity, which keeps it in your organization.')).toBeVisible()
    await expect(dialog.getByText('No entity (direct roles)')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })
})

// outlabs-auth 0.1.0a35 refuses an admin without global reach any change to an account holding a
// direct system-wide role row, in any state (DD-061: a revoked grant can come back without anyone
// reviewing the account). The detail reads the account's direct roles to know it, says why and
// offers none of the refused changes; entity memberships are not covered by the rule.
test.describe('accounts holding a system-wide role, as a delegated organisation admin', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.use({ storageState: personaState('orgAdmin'), errorGuardMode: 'strict' })

  type DirectRow = { status: string, role: { is_global: boolean, root_entity_id: string | null, scope_entity_id: string | null } }
  const systemWide = (row: DirectRow) => row.role.is_global && !row.role.root_entity_id && !row.role.scope_entity_id

  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', personas: ['orgAdmin'] })
  })

  async function accountWithSystemWideRow(api: ApiClient, orgRoot: string, kind: string) {
    const role = await api.createRole({ kind, is_global: true, permissions: ['lead:read'] })
    const user = await api.createUser({ kind, root_entity_id: orgRoot })
    await api.post(`/users/${user.id}/roles`, { role_id: role.id })
    return { role, user }
  }

  test('the seeded account with a system-wide role says why and offers no change the server refuses', async ({ page, api }) => {
    const target = await api.findUserByEmail(persona('permissionsAdmin').email)
    expectSeeded(target, 'the seed has the permissions admin')
    const rows = await api.get<DirectRow[]>(`/users/${target.id}/role-memberships`, { query: { include_inactive: true } })
    expectSeeded(rows.find(systemWide), 'the permissions admin holds a system-wide role directly')

    await page.goto(userDetailPath(target.id))
    const notice = page.getByTestId('user-global-account')
    await expect(notice).toContainText('Only global administrators can change this account')
    await expect(notice).toContainText('even revoked')
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(userActionsButton(page)).toHaveCount(0)

    // Access: no direct-role change; memberships stay theirs to manage (the rule does not cover them).
    await page.goto(userDetailPath(target.id, 'access'))
    await expect(notice).toBeVisible()
    await expect(cardByHeading(page, 'Direct roles').getByRole('button', { name: 'Assign roles' })).toHaveCount(0)
    await expect(cardByHeading(page, 'Memberships').getByRole('button', { name: 'Add membership' })).toBeVisible()

    // Security: no session revoked, no key revoked.
    await page.goto(userDetailPath(target.id, 'security'))
    await expect(notice).toBeVisible()
    const sessions = cardByHeading(page, 'Active sessions')
    await expect(sessions.getByRole('heading', { name: 'Active sessions' })).toBeVisible()
    await expect(sessions.getByRole('button', { name: 'Sign out everywhere' })).toHaveCount(0)
    await expect(sessions.getByRole('button', { name: /^Revoke session/ })).toHaveCount(0)
  })

  test('a revoked system-wide role still holds the account for global admins; a superuser is offered every change', async ({ page, api, apiAs, sessionContext }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const { role, user } = await accountWithSystemWideRow(api, me.root_entity_id, 'sw-revoked')
    await api.delete(`/users/${user.id}/roles/${role.id}`)
    const rows = await api.get<DirectRow[]>(`/users/${user.id}/role-memberships`, { query: { include_inactive: true } })
    expect(rows.map(row => row.status)).toEqual(['revoked'])

    await page.goto(userDetailPath(user.id))
    await expect(page.getByTestId('user-global-account')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(userActionsButton(page)).toHaveCount(0)

    // A global admin may change it: no notice, every action.
    const admin = await (await sessionContext(personaState('admin'))).newPage()
    await admin.goto(userDetailPath(user.id))
    await expect(admin.getByRole('heading', { name: user.email })).toBeVisible()
    await expect(admin.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await expect(userActionsButton(admin)).toBeVisible()
    await expect(admin.getByTestId('user-global-account')).toHaveCount(0)
  })

  test('nothing is offered until the account\'s direct roles have answered (F-209)', async ({ page, api, apiAs }) => {
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const user = await api.createUser({ kind: 'sw-none', root_entity_id: me.root_entity_id })
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(new RegExp(`/users/${user.id}/role-memberships(\\?.*)?$`), async (route) => {
      await held
      await route.continue()
    })

    await page.goto(userDetailPath(user.id))
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    release()
    // No system-wide role: the usual changes, and no notice.
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible()
    await expect(page.getByTestId('user-global-account')).toHaveCount(0)
  })

  test('a system-wide row of an archived role is not readable: the change is offered and the server\'s refusal shown', async ({ page, api, apiAs, errorGuard }) => {
    // outlabs-auth leaves archived role definitions out of the direct-role read but still counts
    // them in the refusal (PRODUCTION.md section 8): the console cannot know, the server says.
    const me = await apiAs('orgAdmin').me()
    expectSeeded(me.root_entity_id, 'the org admin belongs to an organization')
    const { role, user } = await accountWithSystemWideRow(api, me.root_entity_id, 'sw-archived')
    await api.delete(`/roles/${role.id}`)
    expect(await api.get<DirectRow[]>(`/users/${user.id}/role-memberships`, { query: { include_inactive: true } })).toEqual([])
    errorGuard.allow({ kind: 'api', status: 403, url: new RegExp(`/users/${user.id}$`) })

    await page.goto(userDetailPath(user.id))
    await expect(page.getByTestId('user-global-account')).toHaveCount(0)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${user.email}` })
    await dialog.getByLabel('First name').fill('Renamed')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toContainText('Only global administrators can modify an account that holds a system-wide role.')
    await expect(dialog).toBeVisible()
  })
})
