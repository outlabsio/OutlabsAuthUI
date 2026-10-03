import type { Locator } from '@playwright/test'
import { backendConfigured, expect, test, type ApiClient, type Page } from '../support/fixtures'
import { type A11yVariant, DESKTOP_VARIANTS, PHONE_VARIANTS, expectAccessible } from '../support/a11y'
import { type ApiKeyRow, grantableScope, pastExpiry, rewriteKeys } from '../support/api-keys'
import { cardByHeading } from '../support/entities'
import { apiUrl } from '../support/env'
import { jsonResponse } from '../support/mocks'
import { patchAuthConfig } from '../support/capabilities'
import { commandPalette } from '../support/shell'
import { userActionsButton, userDetailPath } from '../support/users'

// The accessibility sweep of every other dialog the console opens (F-138): the main create
// dialogs, one confirmation and the loading role picker are in a11y-smoke.spec.ts; this file
// covers the rest (record dialogs, row-menu dialogs, confirmations, the one-time secret, the
// discard prompt, slideovers, the command palette and the popovers, which are dialogs too). Each
// test opens one dialog the way an admin does, scans it with axe in light and dark at 1440 and
// 390px (support/a11y.ts; only at the width where its opener exists for a phone- or desktop-only
// control), closes it with Escape and checks that focus went back to the control that opened it.
// Records are created through the API and run-marked; a state the backend cannot be put in
// quickly (a session list, a linked provider account, a phone number, an expired key) is served
// by rewriting the response, as the area specs do. Nothing is submitted unless a dialog only
// exists after a submit (the one-time secret, Check access's answer).
test.use({ errorGuardMode: 'strict' })

test.describe.configure({ timeout: 90_000 })

const ANY_DIALOG = '[role="dialog"], [role="alertdialog"]'
const SCOPE = 'user:read'
const FIREFOX_ON_WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0'

async function settled(page: Page) {
  // Below lg some record pages show the record in a slideover over the list, so any heading.
  await expect(page.getByRole('heading').first()).toBeVisible()
  await page.waitForLoadState('networkidle')
}

/** Opens a dialog from a button with the keyboard, the way focus return matters; returns the button. */
async function pressOpen(page: Page, opener: Locator): Promise<Locator> {
  await opener.focus()
  await page.keyboard.press('Enter')
  return opener
}

/** Opens a dialog from a dropdown menu item; focus returns to the menu's button. */
async function pickFromMenu(page: Page, menuButton: Locator, item: string | RegExp): Promise<Locator> {
  await menuButton.click()
  await page.getByRole('menuitem', typeof item === 'string' ? { name: item, exact: true } : { name: item }).click()
  return menuButton
}

/**
 * Scans the open dialog with axe (every variant unless narrowed), closes it with Escape and,
 * when the opener is given, checks that focus went back to it.
 */
async function sweep(page: Page, dialog: Locator, { opener, variants }: { opener?: Locator, variants?: A11yVariant[] } = {}) {
  await expect(dialog).toBeVisible()
  await expectAccessible(page, { scope: dialog, include: ANY_DIALOG, variants })
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  if (opener) await expect(opener).toBeFocused()
}

async function openUser(page: Page, userId: string, tab?: 'access' | 'security') {
  await page.goto(userDetailPath(userId, tab))
  await settled(page)
}

type RoleMembership = { id: string, role_id: string }
type Account = { id: string, name: string, anchor_entity_id: string | null }
type Key = { id: string, name: string }

const SA_BASE = '/admin/system/integration-principals'

async function createServiceAccount(api: ApiClient, name: string, entityId?: string): Promise<Account> {
  const base = entityId ? `/admin/entities/${entityId}/integration-principals` : SA_BASE
  return api.post<Account>(base, { name, allowed_scopes: [SCOPE], role_ids: [] })
}

async function createServiceAccountKey(api: ApiClient, account: Account, name: string): Promise<Key> {
  const base = account.anchor_entity_id ? `/admin/entities/${account.anchor_entity_id}/integration-principals` : SA_BASE
  return api.post<Key>(`${base}/${account.id}/api-keys`, { name, scopes: [SCOPE] })
}

// A direct role assignment of a fresh role, so its row is this test's alone.
async function assignRole(api: ApiClient, userId: string, kind: string) {
  const role = await api.createRole({ kind, permissions: [SCOPE] })
  const membership = await api.post<RoleMembership>(`/users/${userId}/roles`, { role_id: role.id })
  return { role, membership }
}

test.describe('accessibility: user dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('Edit profile (user detail)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-profile' })
    await openUser(page, user.id)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'Edit', exact: true }))
    await sweep(page, page.getByRole('dialog', { name: `Edit ${user.email}` }), { opener })
  })

  test('Change status (user detail)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-status' })
    await openUser(page, user.id)
    const opener = await pickFromMenu(page, userActionsButton(page), 'Change status')
    await sweep(page, page.getByRole('dialog', { name: `Change status of ${user.email}` }), { opener })
  })

  test('Reset password (user detail)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-reset' })
    await openUser(page, user.id)
    const opener = await pickFromMenu(page, userActionsButton(page), 'Reset password')
    await sweep(page, page.getByRole('dialog', { name: `Reset password of ${user.email}` }), { opener })
  })

  test('Grant superuser (user detail)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-grant-su' })
    await openUser(page, user.id)
    const opener = await pickFromMenu(page, userActionsButton(page), 'Grant superuser')
    await sweep(page, page.getByRole('dialog', { name: `Grant superuser to ${user.email}` }), { opener })
  })

  test('Revoke superuser (user detail)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-revoke-su', is_superuser: true })
    await openUser(page, user.id)
    const opener = await pickFromMenu(page, userActionsButton(page), 'Revoke superuser')
    await sweep(page, page.getByRole('dialog', { name: `Revoke superuser from ${user.email}` }), { opener })
  })

  test('Resend invitation (user detail)', async ({ page, api, requires, testData }) => {
    await requires({ features: ['invitations'] })
    const email = testData.email('a11y-invited')
    await api.post('/auth/invite', { email })
    const invited = await api.findUserByEmail(email)
    expect(invited, 'invited user').toBeTruthy()
    await openUser(page, invited!.id)
    const opener = await pickFromMenu(page, userActionsButton(page), 'Resend invite')
    await sweep(page, page.getByRole('dialog', { name: `Resend invitation to ${email}` }), { opener })
  })

  test('Restore user (user detail)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-restore' })
    await api.delete(`/users/${user.id}`)
    await openUser(page, user.id)
    const opener = await pickFromMenu(page, userActionsButton(page), 'Restore user')
    await sweep(page, page.getByRole('dialog', { name: `Restore user ${user.email}` }), { opener })
  })

  test('Check access, before and after the server answers', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-check' })
    await openUser(page, user.id, 'access')
    const opener = await pressOpen(page, cardByHeading(page, 'Effective permissions').getByRole('button', { name: 'Check access' }))
    const dialog = page.getByRole('dialog', { name: 'Check access' })
    await expect(dialog).toBeVisible()
    await expectAccessible(page, { scope: dialog, include: ANY_DIALOG })
    // The answer is part of the dialog: ask about one permission and scan again.
    await dialog.getByLabel('Permissions', { exact: true }).click()
    await page.getByRole('combobox', { name: 'Search permissions' }).fill(SCOPE)
    await page.getByRole('option').filter({ has: page.locator('[data-slot="itemLabel"]', { hasText: new RegExp(`^${SCOPE}$`) }) }).click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('listbox')).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Check access' }).click()
    await expect(dialog.getByTestId('check-access-results').getByRole('status')).toContainText('Holds 0 of 1')
    await sweep(page, dialog, { opener })
  })

  test('Assign roles, and the calendar of its date field', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-assign' })
    await openUser(page, user.id, 'access')
    const opener = await pressOpen(page, cardByHeading(page, 'Direct roles').getByRole('button', { name: 'Assign roles' }))
    const dialog = page.getByRole('dialog', { name: 'Assign roles' })
    await expect(dialog.getByTestId('role-access-editor')).toBeVisible()
    await expectAccessible(page, { scope: dialog, include: ANY_DIALOG })
    // The calendar popover of a date field (AppDateField), over the dialog. A popover is named by
    // the button that opened it.
    const calendarButton = await pressOpen(page, dialog.getByRole('button', { name: 'Open calendar for Valid until' }))
    const calendar = page.getByRole('dialog', { name: 'Open calendar for Valid until' })
    await expect(calendar.getByRole('button', { name: /^Previous month/ })).toBeVisible()
    await sweep(page, calendar, { opener: calendarButton })
    await sweep(page, dialog, { opener })
  })

  test('Edit role assignment (row menu)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-edit-grant' })
    const { role } = await assignRole(api, user.id, 'a11y-edit-grant')
    await openUser(page, user.id, 'access')
    const opener = await pickFromMenu(page, page.getByRole('button', { name: `Role actions for ${role.display_name}` }), 'Edit assignment')
    await sweep(page, page.getByRole('dialog', { name: 'Edit role assignment' }), { opener })
  })

  test('Remove role (row menu)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-remove-grant' })
    const { role } = await assignRole(api, user.id, 'a11y-remove-grant')
    await openUser(page, user.id, 'access')
    const opener = await pickFromMenu(page, page.getByRole('button', { name: `Role actions for ${role.display_name}` }), 'Remove')
    await sweep(page, page.getByRole('dialog', { name: `Remove role ${role.display_name}` }), { opener })
  })

  test('Reactivate a suspended role assignment (row menu)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-react-grant' })
    const { role, membership } = await assignRole(api, user.id, 'a11y-react-grant')
    await api.patch(`/users/${user.id}/role-memberships/${membership.id}`, { status: 'suspended' })
    await openUser(page, user.id, 'access')
    const opener = await pickFromMenu(page, page.getByRole('button', { name: `Role actions for ${role.display_name}` }), 'Reactivate')
    await sweep(page, page.getByRole('dialog', { name: `Reactivate role ${role.display_name}` }), { opener })
  })

  test('a role chip\'s permissions (popover)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-chip' })
    const { role } = await assignRole(api, user.id, 'a11y-chip')
    await openUser(page, user.id, 'access')
    const chip = cardByHeading(page, 'Effective permissions').getByRole('button', { name: role.display_name, exact: true }).first()
    await pressOpen(page, chip)
    const popover = page.getByRole('dialog', { name: role.display_name, exact: true })
    await expect(popover.getByTestId('role-chip-permissions')).toBeVisible()
    await sweep(page, popover, { opener: chip })
  })

  // The sessions are served (GET only): the dialogs are opened and closed, nothing is revoked,
  // and no password login is spent.
  test('Revoke session and Sign out everywhere (an admin, on the user\'s Security tab)', async ({ page, api }) => {
    const user = await api.createUser({ kind: 'a11y-sessions' })
    const now = Date.now()
    const session = { id: 's-firefox', device_name: null, ip_address: '203.0.113.42', user_agent: FIREFOX_ON_WINDOWS, created_at: new Date(now - 60_000).toISOString(), last_used_at: null, expires_at: new Date(now + 7 * 86_400_000).toISOString(), usage_count: 1 }
    await page.route(apiUrl(`/users/${user.id}/sessions`), route => (route.request().method() === 'GET' ? route.fulfill(jsonResponse(200, [session])) : route.fallback()))
    await openUser(page, user.id, 'security')
    const card = cardByHeading(page, 'Active sessions')
    const revoke = await pressOpen(page, card.getByRole('button', { name: /^Revoke session: Firefox 130 on Windows/ }))
    await sweep(page, page.getByRole('dialog', { name: /^Revoke session Firefox 130 on Windows/ }), { opener: revoke })
    const everywhere = await pressOpen(page, card.getByRole('button', { name: 'Sign out everywhere' }))
    await sweep(page, page.getByRole('dialog', { name: `Sign out ${user.email} everywhere` }), { opener: everywhere })
  })

  test('Revoke a personal API key (user detail)', async ({ page, api, requires, testData }) => {
    await requires({ features: ['api_keys'] })
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    const me = await api.me()
    const key = await api.post<Key>('/api-keys/', { name: testData.name('a11y-user-key'), scopes: [scope], key_kind: 'personal' })
    // Only this key is listed: the admin's other keys (other specs make them in parallel) could
    // page it out.
    await page.route(new RegExp(`/users/${me.id}/api-keys$`), async (route) => {
      if (route.request().method() !== 'GET') return route.continue()
      const rows = await (await route.fetch()).json() as ApiKeyRow[]
      await route.fulfill({ json: rows.filter(row => row.id === key.id) })
    })
    await openUser(page, me.id, 'security')
    const opener = await pickFromMenu(page, page.getByRole('button', { name: `Personal API key actions for ${key.name}`, exact: true }), 'Revoke')
    await sweep(page, page.getByRole('dialog', { name: `Revoke API key ${key.name}` }), { opener })
  })
})

test.describe('accessibility: membership dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test.beforeEach(async ({ requires }) => {
    await requires({ surfaces: ['memberships', 'entities'] })
  })

  async function memberOf(api: ApiClient, kind: string, membership: Record<string, unknown> = {}) {
    const root = await api.createEntity({ kind: `${kind}-root` })
    const office = await api.createEntity({ kind, entity_type: 'office', parent_entity_id: root.id })
    const user = await api.createUser({ kind, root_entity_id: root.id })
    await api.post('/memberships/', { user_id: user.id, entity_id: office.id, role_ids: [], ...membership })
    return { root, office, user }
  }

  const membershipMenu = (page: Page, entityName: string) =>
    cardByHeading(page, 'Memberships').getByRole('button', { name: `Membership actions for ${entityName}`, exact: true })

  test('Add membership (user detail)', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'a11y-add-mem' })
    const user = await api.createUser({ kind: 'a11y-add-mem', root_entity_id: root.id })
    await openUser(page, user.id, 'access')
    const opener = await pressOpen(page, cardByHeading(page, 'Memberships').getByRole('button', { name: 'Add membership' }))
    await sweep(page, page.getByRole('dialog', { name: 'Add membership' }), { opener })
  })

  test('Edit membership (row menu)', async ({ page, api }) => {
    const { office, user } = await memberOf(api, 'a11y-edit-mem')
    await openUser(page, user.id, 'access')
    const opener = await pickFromMenu(page, membershipMenu(page, office.display_name), 'Edit access')
    await sweep(page, page.getByRole('dialog', { name: `Edit membership in ${office.display_name}` }), { opener })
  })

  test('Remove membership (row menu)', async ({ page, api }) => {
    const { office, user } = await memberOf(api, 'a11y-remove-mem')
    await openUser(page, user.id, 'access')
    const opener = await pickFromMenu(page, membershipMenu(page, office.display_name), 'Remove')
    await sweep(page, page.getByRole('dialog', { name: `Remove membership in ${office.display_name}` }), { opener })
  })

  test('Reactivate a suspended membership (row menu)', async ({ page, api }) => {
    const { office, user } = await memberOf(api, 'a11y-react-mem', { status: 'suspended' })
    await openUser(page, user.id, 'access')
    const opener = await pickFromMenu(page, membershipMenu(page, office.display_name), 'Reactivate')
    await sweep(page, page.getByRole('dialog', { name: `Reactivate membership in ${office.display_name}` }), { opener })
  })
})

test.describe('accessibility: role and permission dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('Edit role (role page)', async ({ page, api }) => {
    const role = await api.createRole({ kind: 'a11y-edit-role', permissions: [SCOPE] })
    await page.goto(`/app/roles/${role.id}`)
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'Edit', exact: true }))
    await sweep(page, page.getByRole('dialog', { name: `Edit role ${role.display_name}` }), { opener })
  })

  test('Duplicate role (role page menu)', async ({ page, api }) => {
    const role = await api.createRole({ kind: 'a11y-dup-role', permissions: [SCOPE] })
    await page.goto(`/app/roles/${role.id}`)
    await settled(page)
    const opener = await pickFromMenu(page, page.getByRole('button', { name: 'More role actions' }), 'Duplicate as custom role')
    await sweep(page, page.getByRole('dialog', { name: `Duplicate role ${role.display_name}` }), { opener })
  })

  test('Archive role (role page menu)', async ({ page, api }) => {
    const role = await api.createRole({ kind: 'a11y-archive-role' })
    await page.goto(`/app/roles/${role.id}`)
    await settled(page)
    const opener = await pickFromMenu(page, page.getByRole('button', { name: 'More role actions' }), 'Archive')
    await sweep(page, page.getByRole('dialog', { name: `Archive role ${role.display_name}` }), { opener })
  })

  test('Edit permission (permission page)', async ({ page, api }) => {
    const permission = await api.createPermission({ kind: 'a11y-edit-perm' })
    await page.goto(`/app/permissions/${permission.id}`)
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'Edit', exact: true }))
    await sweep(page, page.getByRole('dialog', { name: 'Edit permission' }), { opener })
  })

  test('Archive permission (permission page menu)', async ({ page, api }) => {
    const permission = await api.createPermission({ kind: 'a11y-archive-perm' })
    await page.goto(`/app/permissions/${permission.id}`)
    await settled(page)
    const opener = await pickFromMenu(page, page.getByRole('button', { name: 'More permission actions' }), 'Archive')
    await sweep(page, page.getByRole('dialog', { name: `Archive permission ${permission.name}` }), { opener })
  })
})

test.describe('accessibility: ABAC condition dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test.beforeEach(async ({ requires }) => {
    await requires({ features: ['abac'] })
  })

  // A permission nobody holds, with one OR group holding one condition.
  async function conditionedPermission(api: ApiClient) {
    const permission = await api.createPermission({ kind: 'a11y-abac' })
    const group = await api.post<{ id: string }>(`/permissions/${permission.id}/condition-groups`, { operator: 'OR', description: 'Either check' })
    await api.post(`/permissions/${permission.id}/conditions`, { attribute: 'env.on_call', operator: 'is_true', value_type: 'boolean', condition_group_id: group.id })
    return permission
  }

  async function openConditions(page: Page, permissionId: string) {
    await page.goto(`/app/permissions/${permissionId}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()
    await page.waitForLoadState('networkidle')
  }

  test('Add condition and Add condition group', async ({ page, api }) => {
    const permission = await api.createPermission({ kind: 'a11y-abac-add' })
    await openConditions(page, permission.id)
    const addCondition = await pressOpen(page, page.getByRole('button', { name: 'Add condition', exact: true }).first())
    await sweep(page, page.getByRole('dialog', { name: 'Add condition' }), { opener: addCondition })
    const addGroup = await pressOpen(page, page.getByRole('button', { name: 'Add group', exact: true }).first())
    await sweep(page, page.getByRole('dialog', { name: 'Add condition group' }), { opener: addGroup })
  })

  test('Edit condition and Delete condition (condition menu)', async ({ page, api }) => {
    const permission = await conditionedPermission(api)
    await openConditions(page, permission.id)
    const menu = page.getByRole('button', { name: 'Actions for condition env.on_call' })
    await sweep(page, page.getByRole('dialog', { name: 'Edit condition' }), { opener: await pickFromMenu(page, menu, 'Edit condition') })
    await sweep(page, page.getByRole('dialog', { name: 'Delete condition' }), { opener: await pickFromMenu(page, menu, 'Delete condition') })
  })

  test('Edit condition group and Delete group (group menu)', async ({ page, api }) => {
    const permission = await conditionedPermission(api)
    await openConditions(page, permission.id)
    const menu = page.getByRole('button', { name: 'Actions for group 1' })
    await sweep(page, page.getByRole('dialog', { name: 'Edit condition group' }), { opener: await pickFromMenu(page, menu, 'Edit group') })
    await sweep(page, page.getByRole('dialog', { name: 'Delete group 1' }), { opener: await pickFromMenu(page, menu, 'Delete group') })
  })
})

// The entity record sits in the page from lg up and in the "Entity details" slideover below it.
// A dialog belongs to the record it was opened from, so it closes when the window crosses lg:
// each layout is opened and swept at its own width.
const ENTITY_LAYOUTS = [
  { name: 'desktop', width: 1440, height: 900, variants: DESKTOP_VARIANTS },
  { name: 'phone', width: 390, height: 844, variants: PHONE_VARIANTS }
] as const

async function sweepEntityDialog(
  page: Page,
  entity: { id: string, display_name: string },
  open: (record: Locator) => Promise<{ dialog: Locator, opener: Locator }>
) {
  for (const layout of ENTITY_LAYOUTS) {
    await page.setViewportSize({ width: layout.width, height: layout.height })
    await page.goto(`/app/entities?entity=${entity.id}`)
    const record = layout.name === 'phone' ? page.getByRole('dialog', { name: 'Entity details' }) : page.getByRole('main')
    await expect(record.getByRole('heading', { name: entity.display_name, exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const { dialog, opener } = await open(record)
    await sweep(page, dialog, { opener, variants: [...layout.variants] })
  }
}

test.describe('accessibility: entity dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test.beforeEach(async ({ requires }) => {
    await requires({ surfaces: ['entities'] })
  })

  const moreActions = (record: Locator) => record.getByRole('button', { name: 'More entity actions' })

  test('Edit entity', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'a11y-edit-entity' })
    await sweepEntityDialog(page, entity, async record => ({
      opener: await pressOpen(page, record.getByRole('button', { name: 'Edit', exact: true })),
      dialog: page.getByRole('dialog', { name: `Edit ${entity.display_name}` })
    }))
  })

  test('Move entity (entity menu)', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'a11y-move-root' })
    const office = await api.createEntity({ kind: 'a11y-move', entity_type: 'office', parent_entity_id: root.id })
    await sweepEntityDialog(page, office, async record => ({
      opener: await pickFromMenu(page, moreActions(record), 'Move'),
      dialog: page.getByRole('dialog', { name: `Move ${office.display_name}` })
    }))
  })

  test('Governance (entity menu)', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'a11y-governance' })
    await sweepEntityDialog(page, entity, async record => ({
      opener: await pickFromMenu(page, moreActions(record), 'Governance'),
      dialog: page.getByRole('dialog', { name: `Governance of ${entity.display_name}` })
    }))
  })

  test('Archive an entity with an active child (typed confirmation and acknowledgement)', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'a11y-archive-entity' })
    await api.createEntity({ kind: 'a11y-archive-child', entity_type: 'office', parent_entity_id: root.id })
    await sweepEntityDialog(page, root, async (record) => {
      const opener = await pickFromMenu(page, moreActions(record), 'Archive')
      const dialog = page.getByRole('dialog', { name: `Archive ${root.display_name}` })
      await expect(dialog.getByRole('checkbox')).toBeVisible()
      return { opener, dialog }
    })
  })

  test('the entity record at phone width (slideover)', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'a11y-entity-sheet' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/app/entities?entity=${entity.id}`)
    const sheet = page.getByRole('dialog', { name: 'Entity details' })
    await expect(sheet.getByRole('heading', { name: entity.display_name, exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
    await sweep(page, sheet, { variants: PHONE_VARIANTS })
  })
})

test.describe('accessibility: entity member dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test.beforeEach(async ({ requires }) => {
    await requires({ surfaces: ['entities', 'memberships'] })
  })

  async function entityWithMember(api: ApiClient, kind: string, membership: Record<string, unknown> = {}) {
    const entity = await api.createEntity({ kind })
    const user = await api.createUser({ kind, root_entity_id: entity.id })
    await api.post('/memberships/', { user_id: user.id, entity_id: entity.id, role_ids: [], status: 'active', ...membership })
    return { entity, user, member: `E2E ${kind}` }
  }

  const membersCard = (record: Locator) => record.getByRole('heading', { name: 'Users', exact: true }).locator('xpath=ancestor::*[@data-slot="root"][1]')
  const memberMenu = (record: Locator, member: string) => record.getByRole('button', { name: `Member actions for ${member}`, exact: true })

  test('Add member', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'a11y-add-member' })
    await sweepEntityDialog(page, entity, async record => ({
      opener: await pressOpen(page, membersCard(record).getByRole('button', { name: 'Add member' })),
      dialog: page.getByRole('dialog', { name: 'Add member' })
    }))
  })

  test('Edit member access (row menu)', async ({ page, api }) => {
    const { entity, user, member } = await entityWithMember(api, 'a11y-edit-member')
    await sweepEntityDialog(page, entity, async record => ({
      opener: await pickFromMenu(page, memberMenu(record, member), 'Edit access'),
      dialog: page.getByRole('dialog', { name: `Edit access for ${user.email}` })
    }))
  })

  test('Remove member (row menu)', async ({ page, api }) => {
    const { entity, user, member } = await entityWithMember(api, 'a11y-remove-member')
    await sweepEntityDialog(page, entity, async record => ({
      opener: await pickFromMenu(page, memberMenu(record, member), 'Remove'),
      dialog: page.getByRole('dialog', { name: `Remove ${user.email} from ${entity.display_name}` })
    }))
  })

  test('Reactivate a suspended member (row menu)', async ({ page, api }) => {
    const { entity, member } = await entityWithMember(api, 'a11y-react-member', { status: 'suspended' })
    await sweepEntityDialog(page, entity, async (record) => {
      // Suspended members are listed with Include inactive.
      await membersCard(record).getByRole('switch', { name: 'Include inactive' }).click()
      return {
        opener: await pickFromMenu(page, memberMenu(record, member), 'Reactivate'),
        dialog: page.getByRole('dialog', { name: /^Reactivate membership/ })
      }
    })
  })
})

test.describe('accessibility: service account dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test.beforeEach(async ({ requires }) => {
    await requires({ surfaces: ['integration_principals'], features: ['system_api_keys'] })
  })

  async function openAccount(page: Page, account: Account, tab?: 'keys') {
    await page.goto(`/app/service-accounts/${account.id}${tab ? `?tab=${tab}` : ''}`)
    await expect(page.getByRole('heading', { name: account.name, exact: true })).toBeVisible()
    await page.waitForLoadState('networkidle')
  }

  const accountMenu = (page: Page) => page.getByRole('button', { name: 'More service account actions' })
  const keyMenu = (page: Page, name: string) => page.getByRole('button', { name: `Key actions for ${name}`, exact: true })

  test('Edit service account (account page)', async ({ page, api, testData }) => {
    const account = await createServiceAccount(api, testData.name('a11y-sa-edit'))
    await openAccount(page, account)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'Edit', exact: true }))
    await sweep(page, page.getByRole('dialog', { name: 'Edit service account' }), { opener })
  })

  test('Deactivate and Archive service account (account menu)', async ({ page, api, testData }) => {
    const account = await createServiceAccount(api, testData.name('a11y-sa-life'))
    await openAccount(page, account)
    await sweep(page, page.getByRole('dialog', { name: `Deactivate service account ${account.name}` }), { opener: await pickFromMenu(page, accountMenu(page), 'Deactivate') })
    await sweep(page, page.getByRole('dialog', { name: `Archive service account ${account.name}` }), { opener: await pickFromMenu(page, accountMenu(page), 'Archive') })
  })

  test('Reactivate service account (account menu)', async ({ page, api, testData }) => {
    const account = await createServiceAccount(api, testData.name('a11y-sa-react'))
    await api.patch(`${SA_BASE}/${account.id}`, { status: 'inactive' })
    await openAccount(page, account)
    const opener = await pickFromMenu(page, accountMenu(page), 'Reactivate')
    await sweep(page, page.getByRole('dialog', { name: `Reactivate service account ${account.name}` }), { opener })
  })

  test('New key and Edit key (Keys tab)', async ({ page, api, testData }) => {
    const account = await createServiceAccount(api, testData.name('a11y-sa-keys'))
    const key = await createServiceAccountKey(api, account, testData.name('a11y-key'))
    await openAccount(page, account, 'keys')
    const add = await pressOpen(page, page.getByRole('button', { name: 'New key', exact: true }))
    await sweep(page, page.getByRole('dialog', { name: 'New key' }), { opener: add })
    await sweep(page, page.getByRole('dialog', { name: 'Edit key' }), { opener: await pickFromMenu(page, keyMenu(page, key.name), 'Edit') })
  })

  test('Rotate, Suspend and Revoke key (key menu)', async ({ page, api, testData }) => {
    const account = await createServiceAccount(api, testData.name('a11y-sa-key-actions'))
    const key = await createServiceAccountKey(api, account, testData.name('a11y-key'))
    await openAccount(page, account, 'keys')
    for (const [item, title] of [['Rotate', 'Rotate key'], ['Suspend', 'Suspend key'], ['Revoke', 'Revoke key']] as const) {
      await sweep(page, page.getByRole('dialog', { name: `${title} ${key.name}` }), { opener: await pickFromMenu(page, keyMenu(page, key.name), item) })
    }
  })

  test('Reactivate key (key menu)', async ({ page, api, testData }) => {
    const account = await createServiceAccount(api, testData.name('a11y-sa-key-react'))
    const key = await createServiceAccountKey(api, account, testData.name('a11y-key'))
    await api.patch(`${SA_BASE}/${account.id}/api-keys/${key.id}`, { status: 'suspended' })
    await openAccount(page, account, 'keys')
    const opener = await pickFromMenu(page, keyMenu(page, key.name), 'Reactivate')
    await sweep(page, page.getByRole('dialog', { name: `Reactivate key ${key.name}` }), { opener })
  })

  test('About service accounts (guide slideover)', async ({ page }) => {
    await page.goto('/app/service-accounts')
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'About service accounts' }))
    await sweep(page, page.getByRole('dialog', { name: 'About service accounts' }), { opener })
  })

  test('the key inventory: key detail and Revoke key', async ({ page, api, requires, testData }) => {
    await requires({ surfaces: ['api_key_admin', 'entities'] })
    const entity = await api.createEntity({ kind: 'a11y-inventory' })
    const account = await createServiceAccount(api, testData.name('a11y-inv-sa'), entity.id)
    const key = await createServiceAccountKey(api, account, testData.name('a11y-inv-key'))
    await page.goto(`/app/service-accounts?scope=entity&entity=${entity.id}&view=inventory`)
    await expect(page.getByRole('row').filter({ hasText: key.name })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const view = await pressOpen(page, page.getByRole('button', { name: `View key ${key.name}`, exact: true }))
    await sweep(page, page.getByRole('dialog', { name: key.name }), { opener: view })
    await sweep(page, page.getByRole('dialog', { name: `Revoke key ${key.name}` }), { opener: await pickFromMenu(page, keyMenu(page, key.name), 'Revoke') })
  })
})

test.describe('accessibility: personal API key dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test.beforeEach(async ({ requires }) => {
    await requires({ surfaces: ['api_keys'] })
  })

  async function personalKey(api: ApiClient, name: string, extra: Record<string, unknown> = {}) {
    const scope = await grantableScope(api)
    test.skip(!scope, 'The admin persona has no grantable API key scope.')
    return api.post<Key & ApiKeyRow>('/api-keys/', { name, scopes: [scope], key_kind: 'personal', ...extra })
  }

  async function openKeys(page: Page, name: string) {
    await page.goto(`/app/api-keys?q=${encodeURIComponent(name)}`)
    await expect(page.getByRole('row').filter({ hasText: name })).toBeVisible()
    await page.waitForLoadState('networkidle')
  }

  const keyMenu = (page: Page, name: string) => page.getByRole('button', { name: `API key actions for ${name}`, exact: true })

  test('Edit API key, Rotate, Suspend and Revoke (key menu)', async ({ page, api, testData }) => {
    const key = await personalKey(api, testData.name('a11y-my-key'))
    await openKeys(page, key.name)
    await sweep(page, page.getByRole('dialog', { name: 'Edit API key' }), { opener: await pickFromMenu(page, keyMenu(page, key.name), 'Edit') })
    for (const [item, title] of [['Rotate', 'Rotate API key'], ['Suspend', 'Suspend API key'], ['Revoke', 'Revoke API key']] as const) {
      await sweep(page, page.getByRole('dialog', { name: `${title} ${key.name}` }), { opener: await pickFromMenu(page, keyMenu(page, key.name), item) })
    }
  })

  test('Reactivate API key (key menu)', async ({ page, api, testData }) => {
    const key = await personalKey(api, testData.name('a11y-my-key-react'))
    await api.patch(`/api-keys/${key.id}`, { status: 'suspended' })
    await openKeys(page, key.name)
    const opener = await pickFromMenu(page, keyMenu(page, key.name), 'Reactivate')
    await sweep(page, page.getByRole('dialog', { name: `Reactivate API key ${key.name}` }), { opener })
  })

  test('Create replacement key (an expired key)', async ({ page, api, testData }) => {
    const key = await personalKey(api, testData.name('a11y-my-key-expired'), { expires_in_days: 30 })
    const edit = (row: ApiKeyRow) => (row.id === key.id ? pastExpiry(row) : row)
    await rewriteKeys(page, /\/api-keys\/(\?.*)?$/, edit)
    await rewriteKeys(page, /\/api-keys\/[0-9a-f-]{36}$/, edit)
    await page.goto(`/app/api-keys?q=${encodeURIComponent(key.name)}&status=expired`)
    await expect(page.getByRole('row').filter({ hasText: key.name })).toBeVisible()
    await page.waitForLoadState('networkidle')
    const opener = await pickFromMenu(page, keyMenu(page, key.name), 'Create replacement')
    await sweep(page, page.getByRole('dialog', { name: 'Create replacement key' }), { opener })
  })

  test('the key detail (slideover) and the scopes popover', async ({ page, api, testData }) => {
    const key = await personalKey(api, testData.name('a11y-my-key-detail'))
    // Opened at desktop width, where the Scopes column is (any device project).
    await page.setViewportSize({ width: 1440, height: 900 })
    await openKeys(page, key.name)
    const view = await pressOpen(page, page.getByRole('button', { name: `View key ${key.name}`, exact: true }))
    await sweep(page, page.getByRole('dialog', { name: key.name }), { opener: view })
    // The Scopes column exists from md up. Opening the popover focuses its first scope badge, whose
    // tooltip shows: Escape dismisses that tooltip first, then the popover.
    const scopes = await pressOpen(page, page.getByRole('button', { name: `Scopes of ${key.name}: 1 scope`, exact: true }))
    const popover = page.getByRole('dialog', { name: `Scopes of ${key.name}: 1 scope`, exact: true })
    await expect(popover).toBeVisible()
    await expectAccessible(page, { scope: popover, include: ANY_DIALOG, variants: DESKTOP_VARIANTS })
    const tooltip = page.locator('[role="tooltip"]')
    if (await tooltip.count()) {
      await page.keyboard.press('Escape')
      await expect(tooltip).toHaveCount(0)
      await expect(popover).toBeVisible()
    }
    await page.keyboard.press('Escape')
    await expect(popover).toBeHidden()
    await expect(scopes).toBeFocused()
  })

  // The secret is shown once, after a real rotate of this run's key. It cannot be dismissed with
  // Escape: the admin confirms it is stored and presses Done.
  test('Store the new API key now (one-time secret)', async ({ page, api, testData }) => {
    const key = await personalKey(api, testData.name('a11y-my-key-secret'))
    await openKeys(page, key.name)
    await pickFromMenu(page, keyMenu(page, key.name), 'Rotate')
    await page.getByRole('dialog', { name: `Rotate API key ${key.name}` }).getByRole('button', { name: 'Rotate key' }).click()
    const dialog = page.getByRole('dialog', { name: 'Store the new API key now' })
    await expect(dialog).toBeVisible()
    await expectAccessible(page, { scope: dialog, include: ANY_DIALOG })
    await dialog.getByRole('checkbox', { name: 'I have stored this key somewhere safe' }).check()
    await dialog.getByRole('button', { name: 'Done' }).click()
    await expect(dialog).toBeHidden()
  })
})

test.describe('accessibility: account dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  const PHONE = '+15555550100'

  // The admin's /users/me answered with a phone number (the persona's record is not changed),
  // and access codes on, so a verified number warns before it is replaced.
  async function withPhone(page: Page) {
    await patchAuthConfig(page, config => ({ ...config, auth_methods: { ...(config.auth_methods ?? {}), password: true, access_code: true } }))
    await page.route(apiUrl('/users/me'), async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      if (!response.ok()) return route.fulfill({ response })
      const user = await response.json() as Record<string, unknown>
      return route.fulfill({ response, json: { ...user, phone: PHONE, phone_verified: true } })
    })
  }

  test('Add phone number', async ({ page, api }) => {
    const me = await api.me() as { phone?: string | null }
    test.skip(Boolean(me.phone), 'The admin persona already has a phone number.')
    await page.goto('/app/account')
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'Add phone number' }))
    await sweep(page, page.getByRole('dialog', { name: 'Add phone number' }), { opener })
  })

  test('Change phone number and Remove phone number', async ({ page }) => {
    await withPhone(page)
    await page.goto('/app/account')
    await settled(page)
    const change = await pressOpen(page, page.getByRole('button', { name: 'Change number' }))
    const dialog = page.getByRole('dialog', { name: 'Change phone number' })
    await expect(dialog.getByText('Your current number is verified')).toBeVisible()
    await sweep(page, dialog, { opener: change })
    const remove = await pressOpen(page, page.getByRole('button', { name: `Remove phone number ${PHONE}` }))
    await sweep(page, page.getByRole('dialog', { name: `Remove phone number ${PHONE}` }), { opener: remove })
  })

  // The admin's own sessions with one more device served (GET only): nothing is revoked.
  test('Revoke session and Sign out everywhere (Account › Security)', async ({ page }) => {
    const now = Date.now()
    const other = { id: 's-other-device', device_name: null, ip_address: '203.0.113.42', user_agent: FIREFOX_ON_WINDOWS, created_at: new Date(now - 3_600_000).toISOString(), last_used_at: null, expires_at: new Date(now + 7 * 86_400_000).toISOString(), usage_count: 1 }
    await page.route(apiUrl('/users/me/sessions'), async (route) => {
      if (route.request().method() !== 'GET') return route.fallback()
      const response = await route.fetch()
      const sessions = response.ok() ? await response.json() as unknown[] : []
      return route.fulfill({ response, json: [...sessions, other] })
    })
    await page.goto('/app/account/security')
    await settled(page)
    const revoke = await pressOpen(page, page.getByRole('button', { name: /^Revoke session: Firefox 130 on Windows/ }))
    await sweep(page, page.getByRole('dialog', { name: /^Revoke session Firefox 130 on Windows/ }), { opener: revoke })
    const everywhere = await pressOpen(page, page.getByRole('button', { name: 'Sign out everywhere' }))
    await sweep(page, page.getByRole('dialog', { name: 'Sign out everywhere' }), { opener: everywhere })
  })

  // No example backend links a provider account: one linked account is served (GET only).
  test('Unlink a connected account (Account › Connected accounts)', async ({ page }) => {
    const linked = { id: 'sa-1', provider: 'google', provider_user_id: 'g-123', email: 'admin.google@example.com', email_verified: true, display_name: 'Admin Example', avatar_url: null, linked_at: '2026-08-01T10:00:00Z', last_used_at: null }
    await page.route('**/v1/users/me/social-accounts**', async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204 })
      if (route.request().method() !== 'GET') return route.fallback()
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([linked]) })
    })
    await page.goto('/app/account/connections')
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: `Unlink Google account ${linked.email}` }))
    await sweep(page, page.getByRole('dialog', { name: `Unlink Google account ${linked.email}` }), { opener })
  })
})

test.describe('accessibility: settings and audit dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('Edit entity types (Settings)', async ({ page, requires }) => {
    await requires({ surfaces: ['config'], features: ['entity_hierarchy'] })
    await page.goto('/app/settings')
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'Edit entity types' }))
    await sweep(page, page.getByRole('dialog', { name: 'Edit entity types' }), { opener })
  })

  test('the Audit guide (slideover) and the date range (popover)', async ({ page, requires }) => {
    await requires({ surfaces: ['audit'] })
    // Opened at desktop width, where the date range button is (any device project).
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/app/audit')
    await settled(page)
    const guide = await pressOpen(page, page.getByRole('button', { name: 'Open Audit guide' }))
    await sweep(page, page.getByRole('dialog', { name: 'Audit guide' }), { opener: guide })
    // The date range button exists from sm up.
    const range = await pressOpen(page, page.getByRole('button', { name: /^Date range:/ }))
    await sweep(page, page.getByRole('dialog').filter({ has: page.getByRole('group', { name: 'Date range presets' }) }), { opener: range, variants: DESKTOP_VARIANTS })
  })

  test('the Audit filters at phone width (slideover)', async ({ page, requires }) => {
    await requires({ surfaces: ['audit'] })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/app/audit')
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: /^Filters/ }))
    await sweep(page, page.getByRole('dialog', { name: 'Filters' }), { opener, variants: PHONE_VARIANTS })
  })
})

test.describe('accessibility: shell dialogs', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('the command palette', async ({ page }) => {
    await page.goto('/app/dashboard')
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: /^Search/ }).first())
    const palette = commandPalette(page)
    await expect(palette.getByRole('option').first()).toBeVisible()
    await sweep(page, palette, { opener })
  })

  test('the navigation drawer at phone width', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/app/dashboard')
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'Open sidebar' }))
    const drawer = page.getByRole('dialog').filter({ has: page.getByRole('navigation', { name: 'Console sections' }) })
    await sweep(page, drawer, { opener, variants: PHONE_VARIANTS })
  })

  // The prompt a dirty dialog raises before it discards what was typed (useDialogGuard), stacked
  // over the dialog.
  test('Discard changes? (over a dirty dialog)', async ({ page }) => {
    await page.goto('/app/permissions')
    await settled(page)
    const opener = await pressOpen(page, page.getByRole('button', { name: 'Create permission', exact: true }).first())
    const dialog = page.getByRole('dialog', { name: 'Create permission' })
    await dialog.getByLabel('Display name', { exact: true }).fill('Unsaved')
    await page.keyboard.press('Escape')
    const prompt = page.getByRole('dialog', { name: 'Discard changes?' })
    await expect(prompt).toBeVisible()
    await expectAccessible(page, { scope: prompt, include: ANY_DIALOG })
    await prompt.getByRole('button', { name: 'Discard changes' }).click()
    await expect(prompt).toBeHidden()
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()
  })
})
