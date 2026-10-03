import { expect, test } from '../support/fixtures'
import { pickDay } from '../support/date-field'
import { entityAction, entityOption, openEntity, treeRow } from '../support/entities'
import type { Locator, Page } from '@playwright/test'

// Entities workspace (EnterpriseRBAC, superuser): the organisation tree, create / edit / move /
// archive and the detail's read view. Payloads are asserted through route interception and
// server-side effects through the API. Every record is created per test through the API client
// or with run-marked names (cleanup removes them).

type Captured = Array<Record<string, unknown>>

// POST /entities/ (create) bodies.
async function captureCreates(page: Page): Promise<Captured> {
  const posts: Captured = []
  await page.route(/\/entities\/?$/, async (route) => {
    if (route.request().method() === 'POST') posts.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.continue()
  })
  return posts
}

// Advanced options opens with the stock collapsible's 200 ms height animation. Until it ends the
// section clips its fields, so a field brought into view during it is scrolled to inside the
// section, which then scrolls back as it grows: the field moves between being located and being
// pressed (a release run checked "Structural" while it moved 38 px down, and missed it). Wait for
// the section to finish opening, as a person does. Only finite animations: a spinner never ends.
async function openAdvancedOptions(dialog: Locator) {
  await dialog.getByRole('button', { name: 'Advanced options' }).click()
  await expect(dialog.getByRole('button', { name: 'Hide advanced options' })).toBeVisible()
  await dialog.evaluate(element => Promise.all(element.getAnimations({ subtree: true })
    .filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
    .map(animation => animation.finished)))
}

function slugOf(displayName: string) {
  return displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

test.describe('entities workspace', () => {
  test.use({ errorGuardMode: 'strict', timezoneId: 'America/Argentina/Buenos_Aires' })

  test.beforeEach(async ({ requires }) => {
    await requires({ backend: true, preset: 'EnterpriseRBAC', surfaces: ['entities'] })
  })

  test('the tree shows one organisation; selecting a row opens its detail (no nested links)', async ({ page }) => {
    await page.goto('/app/entities')
    const tree = page.getByRole('tree', { name: 'Entity hierarchy' })
    await expect(tree).toBeVisible()
    // F-181: the row is the control; there is no link inside it.
    await expect(tree.getByRole('link')).toHaveCount(0)
    await treeRow(page, 'ACME Realty').click()
    await expect(page).toHaveURL(/\/app\/entities\?(.*&)?entity=[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: 'Details' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Children' })).toBeVisible()
    // The organisation switcher (superusers) names the organisation in view.
    await expect(page.getByRole('button', { name: 'Organization' })).toContainText('ACME Realty')
  })

  test('Show inactive reveals an inactive entity with a badge; otherwise its branch is hidden and counted', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'tree-root' })
    const inactive = await api.createEntity({ kind: 'tree-inactive', entity_type: 'office', parent_entity_id: root.id, status: 'inactive' })
    await api.createEntity({ kind: 'tree-under-inactive', entity_type: 'team', parent_entity_id: inactive.id })

    await openEntity(page, root.id, root.display_name)
    await expect(treeRow(page, root.display_name)).toBeVisible()
    await expect(treeRow(page, inactive.display_name)).toHaveCount(0)
    await expect(page.getByText('2 inactive hidden')).toBeVisible()

    await page.getByRole('switch', { name: 'Show inactive' }).click()
    const row = treeRow(page, inactive.display_name)
    await expect(row).toBeVisible()
    await expect(row).toContainText('Inactive')
    await row.click()
    await expect(page.getByRole('heading', { name: inactive.display_name, exact: true })).toBeVisible()
    await expect(page.getByText('Members keep their access: to revoke it, archive the entity.')).toBeVisible()
  })

  test('an inactive entity left under an archived parent shows as Detached, with the reason', async ({ page, api }) => {
    // DELETE archives active descendants only, so an inactive child stays behind without a parent.
    const root = await api.createEntity({ kind: 'det-root' })
    const parent = await api.createEntity({ kind: 'det-parent', entity_type: 'office', parent_entity_id: root.id })
    const orphan = await api.createEntity({ kind: 'det-orphan', entity_type: 'team', parent_entity_id: parent.id, status: 'inactive' })
    await api.delete(`/entities/${parent.id}?cascade=false`)

    await page.goto(`/app/entities?root=${root.id}&inactive=true`)
    const row = treeRow(page, orphan.display_name)
    await expect(row).toBeVisible()
    // Its reason is part of the row's accessible name (a tooltip for pointers).
    await expect(row).toHaveAccessibleName(/Detached \(Its parent is archived or outside what you can see\)/)
    await expect(row).not.toHaveAttribute('title')
  })

  test('creates a new top-level organization from the configured root types', async ({ page, testData }) => {
    const posts = await captureCreates(page)
    const display = testData.displayName('org')
    await page.goto('/app/entities')
    await page.getByRole('button', { name: 'New entity' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create entity' })
    await dialog.getByRole('radio', { name: /New organization/ }).check()
    await expect(dialog.getByLabel('Parent', { exact: true })).toHaveCount(0)

    await dialog.getByRole('combobox', { name: 'Type' }).click()
    await page.getByRole('option', { name: 'organization', exact: true }).click()
    await dialog.getByLabel('Display name').fill(display)
    // The system name and slug follow the display name.
    await expect(dialog.getByRole('textbox', { name: /^Slug\*?$/ })).toHaveValue(slugOf(display))
    await expect(dialog.getByRole('textbox', { name: /^System name\*?$/ })).toHaveValue(slugOf(display).replace(/-/g, '_'))
    await dialog.getByRole('button', { name: 'Create entity' }).click()

    await expect(dialog).toBeHidden()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(expect.objectContaining({ display_name: display, slug: slugOf(display), entity_class: 'structural', entity_type: 'organization' }))
    expect(posts[0]!.parent_entity_id).toBeUndefined()
    // F-218: the new organisation opens, as the tree in view.
    await expect(page.getByRole('heading', { name: display, exact: true })).toBeVisible()
    await expect(treeRow(page, display)).toHaveAttribute('aria-selected', 'true')
  })

  test('Add child preselects the parent and sends the advanced options', async ({ page, api, testData }) => {
    const parent = await api.createEntity({ kind: 'parent' })
    const posts = await captureCreates(page)
    const display = testData.displayName('child')
    await openEntity(page, parent.id, parent.display_name)
    await page.getByRole('button', { name: 'Add child' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create entity' })
    await expect(dialog.getByLabel('Parent', { exact: true })).toContainText(parent.display_name)

    await dialog.getByRole('combobox', { name: 'Type' }).click()
    await page.getByRole('option', { name: 'department', exact: true }).click()
    await dialog.getByLabel('Display name').fill(display)
    await openAdvancedOptions(dialog)
    await dialog.getByRole('checkbox', { name: /^Structural/ }).check()
    const types = dialog.getByRole('textbox', { name: 'Allowed child types' })
    await types.fill('team')
    await types.press('Enter')
    await dialog.getByRole('spinbutton', { name: 'Max members' }).fill('12')
    await pickDay(page, 'Valid from', 10)
    await pickDay(page, 'Valid until', 20)
    await dialog.getByRole('button', { name: 'Create entity' }).click()

    await expect(dialog).toBeHidden()
    expect(posts).toHaveLength(1)
    expect(posts[0]).toEqual(expect.objectContaining({
      parent_entity_id: parent.id,
      entity_type: 'department',
      allowed_child_classes: ['structural'],
      allowed_child_types: ['team'],
      max_members: 12
    }))
    // Whole days in the admin's time zone (pinned to UTC-3 for this file).
    const now = new Date()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    expect(posts[0]!.valid_from).toBe(`${now.getFullYear()}-${month}-10T03:00:00.000Z`)
    expect(posts[0]!.valid_until).toBe(`${now.getFullYear()}-${month}-21T02:59:59.999Z`)
    await expect(page.getByRole('heading', { name: display, exact: true })).toBeVisible()
  })

  test('the Type list is the parent\'s allowed child types when it sets them', async ({ page, api }) => {
    const parent = await api.createEntity({ kind: 'governed', allowed_child_types: ['region'], allowed_child_classes: ['structural'] })
    await openEntity(page, parent.id, parent.display_name)
    await page.getByRole('button', { name: 'Add child' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create entity' })
    await expect(dialog.getByText(`Only these types are allowed here (set by ${parent.display_name}).`)).toBeVisible()
    await dialog.getByRole('combobox', { name: 'Type' }).click()
    await expect(page.getByRole('option')).toHaveText(['region'])
  })

  // v-access-01: the dialog mounts per opening and the access group's path is already cached
  // from the detail panel, so the class must follow the parent at once.
  for (const opener of ['Add child', 'New entity'] as const) {
    test(`${opener} on an access group starts on Access group and names the parent`, async ({ page, api, testData }) => {
      const root = await api.createEntity({ kind: 'ag-root' })
      const group = await api.createEntity({ kind: 'ag-team', entity_class: 'access_group', entity_type: 'team', parent_entity_id: root.id })
      const posts = await captureCreates(page)
      await openEntity(page, group.id, group.display_name)
      await page.getByRole('button', { name: opener }).click()
      const dialog = page.getByRole('dialog', { name: 'Create entity' })
      const parent = dialog.getByLabel('Parent', { exact: true })
      await expect(parent).toContainText(group.display_name)
      await expect(parent).not.toContainText(group.id)
      await expect(dialog.getByRole('radio', { name: /^Access group/ })).toBeChecked()
      const structural = dialog.getByRole('radio', { name: /^Structural/ })
      await expect(structural).toBeDisabled()
      await expect(structural).not.toBeChecked()
      if (opener === 'New entity') return

      const display = testData.displayName('ag-child')
      await dialog.getByRole('combobox', { name: 'Type' }).fill('project')
      await page.getByRole('option', { name: /project/ }).first().click()
      await dialog.getByRole('textbox', { name: /^Display name/ }).fill(display)
      await dialog.getByRole('button', { name: 'Create entity' }).click()
      await expect(dialog).toBeHidden()
      expect(posts[0]).toEqual(expect.objectContaining({ parent_entity_id: group.id, entity_class: 'access_group', entity_type: 'project', display_name: display }))
    })
  }

  // New entity used before the organisation's tree and the selection's path have loaded (the
  // detail panel already names the entity) once opened Create entity on "New organization".
  // Both are held here until the dialog is open, so the selection is known only from its record.
  test('New entity opened before the tree and the selection\'s path load still starts under the selection', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'ag-root' })
    const group = await api.createEntity({ kind: 'ag-team', entity_class: 'access_group', entity_type: 'team', parent_entity_id: root.id })
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route(/\/entities\/[0-9a-f-]{36}\/(path|descendants)(\?.*)?$/, async (route) => {
      await held
      await route.continue().catch(() => {})
    })
    await openEntity(page, group.id, group.display_name)
    await page.getByRole('button', { name: 'New entity' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create entity' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('radio', { name: /^Inside an organization/ })).toBeChecked()
    release()
    await expect(dialog.getByLabel('Parent', { exact: true })).toContainText(group.display_name)
    await expect(dialog.getByRole('radio', { name: /^Access group/ })).toBeChecked()
    await expect(dialog.getByRole('radio', { name: /^Structural/ })).toBeDisabled()
  })

  // v-access-02: an empty list beneath a root that sets one means the root's list.
  test('the child-types help says an empty list uses the organization\'s list', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'listed', allowed_child_types: ['region', 'office'] })
    await openEntity(page, root.id, root.display_name)
    await page.getByRole('button', { name: 'Add child' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create entity' })
    await expect(dialog.getByText(`Only these types are allowed here (set by ${root.display_name}).`)).toBeVisible()
    await openAdvancedOptions(dialog)
    await expect(dialog.getByText(`Leave empty to use ${root.display_name}'s list: region, office. Press Enter after each type.`)).toBeVisible()
    await expect(dialog.getByText('Leave empty to allow any type.')).toHaveCount(0)
  })

  // v-access-03: the server matches names with Python's re.fullmatch; patterns JavaScript reads
  // differently are left to it, and its refusal (422) lands on the field.
  test('Python-only naming rules never block a valid name; a breaking one is refused on its field', async ({ page, api, testData, errorGuard }) => {
    errorGuard.allow({ status: 422, url: /\/entities\/?$/ }, { console: /status of 422/ })
    const root = await api.createEntity({ kind: 'py-named', child_name_pattern: '(?i)[a-z0-9_]+', child_display_name_pattern: '\\A[A-Z].*\\Z' })
    const posts = await captureCreates(page)
    await openEntity(page, root.id, root.display_name)
    await page.getByRole('button', { name: 'Add child' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create entity' })
    await expect(dialog.getByTestId('parent-governance')).toContainText('The server checks names against these patterns when you create.')
    await dialog.getByRole('combobox', { name: 'Type' }).fill('office')
    await page.getByRole('option', { name: /office/ }).first().click()

    // Breaks the display-name rule: the client cannot match it, so the server refuses it.
    await dialog.getByRole('textbox', { name: /^Display name/ }).fill(`lower ${testData.displayName('py')}`)
    await dialog.getByRole('button', { name: 'Create entity' }).click()
    await expect(dialog.getByText(/display name .* does not match the root naming rule/i)).toBeVisible()
    expect(posts).toHaveLength(1)

    // Valid in Python: a capitalised display name, a system name with capitals ((?i)).
    const display = testData.displayName('Py')
    await dialog.getByRole('textbox', { name: /^Display name/ }).fill(display)
    await dialog.getByRole('textbox', { name: /^System name/ }).fill(`Mixed_${testData.name('py').replace(/-/g, '_')}`)
    await dialog.getByRole('button', { name: 'Create entity' }).click()
    await expect(dialog).toBeHidden()
    expect(posts).toHaveLength(2)
    expect(posts[1]).toEqual(expect.objectContaining({ parent_entity_id: root.id, display_name: display }))
  })

  test('the root\'s naming guidance is shown and a breaking name is flagged before submit', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'named', child_display_name_pattern: '[A-Z].*', child_naming_guidance: 'Start every name with a capital letter.' })
    const posts = await captureCreates(page)
    await openEntity(page, root.id, root.display_name)
    await page.getByRole('button', { name: 'Add child' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create entity' })
    await expect(dialog.getByTestId('parent-governance')).toContainText('Start every name with a capital letter.')
    await dialog.getByRole('combobox', { name: 'Type' }).click()
    await page.getByRole('option', { name: 'department', exact: true }).click()
    await dialog.getByLabel('Display name').fill('lowercase start')
    await dialog.getByRole('button', { name: 'Create entity' }).click()
    await expect(dialog.getByText('Display name must match the organization\'s pattern [A-Z].*.')).toBeVisible()
    expect(posts).toHaveLength(0)
  })

  test('a new type can be typed when the parent does not restrict types', async ({ page, api, testData }) => {
    const parent = await api.createEntity({ kind: 'free-type' })
    const posts = await captureCreates(page)
    await openEntity(page, parent.id, parent.display_name)
    await page.getByRole('button', { name: 'Add child' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create entity' })
    await dialog.getByRole('combobox', { name: 'Type' }).fill('kiosk')
    await page.getByRole('option', { name: /kiosk/ }).click()
    await dialog.getByRole('textbox', { name: /^Display name/ }).fill(testData.displayName('kiosk'))
    await dialog.getByRole('button', { name: 'Create entity' }).click()
    await expect(dialog).toBeHidden()
    expect(posts[0]).toEqual(expect.objectContaining({ parent_entity_id: parent.id, entity_type: 'kiosk' }))
  })

  test('a deep link to a missing entity says so, with a way back', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 404, url: /\/entities\// }, { console: /status of 404/ })
    await page.goto('/app/entities?entity=00000000-0000-4000-8000-000000000000')
    await expect(page.getByRole('heading', { name: 'Entity not found' })).toBeVisible()
    // The backend answers another tenant's entity with the same 404 (DD-061), so the page cannot
    // tell the two apart and names both, like a user or role outside the organization.
    await expect(page.getByText('It doesn\'t exist, the link is wrong, or the entity is outside your organization.')).toBeVisible()
    await page.getByRole('link', { name: 'Back to entities' }).click()
    await expect(page).not.toHaveURL(/entity=/)
  })

  test('Edit offers Active and Inactive only, explains Inactive, and sends only what changed', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'edit' })
    const renamed = `${entity.display_name} Renamed`
    const patches: Captured = []
    await page.route(/\/entities\/[0-9a-f-]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await openEntity(page, entity.id, entity.display_name)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${entity.display_name}` })

    // F-004: no Archived status — archiving is its own action.
    await dialog.getByRole('combobox', { name: 'Status' }).click()
    await expect(page.getByRole('option')).toHaveText(['Active', 'Inactive'])
    await page.getByRole('option', { name: 'Inactive' }).click()
    await expect(dialog.getByTestId('entity-inactive-note')).toContainText('Inactive does not revoke member access')
    await dialog.getByLabel('Display name').fill(renamed)
    await dialog.getByRole('button', { name: 'Save changes' }).click()

    await expect(dialog).toBeHidden()
    expect(patches).toEqual([{ display_name: renamed, status: 'inactive' }])
    await expect(page.getByRole('heading', { name: renamed, exact: true })).toBeVisible()
  })

  test('Edit refuses an out-of-order validity window (until before from)', async ({ page, api }) => {
    const entity = await api.createEntity({ kind: 'validity' })
    const patches: Captured = []
    await page.route(/\/entities\/[0-9a-f-]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await openEntity(page, entity.id, entity.display_name)
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: `Edit ${entity.display_name}` })
    await pickDay(page, 'Valid from', 20)
    await pickDay(page, 'Valid until', 10)
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog.getByText('Valid until must be on or after valid from.')).toBeVisible()
    await expect(dialog).toBeVisible()
    expect(patches).toHaveLength(0)
  })

  test('Move offers only valid parents in the organisation and shows the impact', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'mv-root' })
    const moving = await api.createEntity({ kind: 'mv-a', entity_type: 'region', parent_entity_id: root.id })
    const below = await api.createEntity({ kind: 'mv-a1', entity_type: 'office', parent_entity_id: moving.id })
    const target = await api.createEntity({ kind: 'mv-b', entity_type: 'region', parent_entity_id: root.id })
    const group = await api.createEntity({ kind: 'mv-group', entity_type: 'team', entity_class: 'access_group', parent_entity_id: root.id })
    const moves: Captured = []
    await page.route(/\/entities\/[0-9a-f-]+\/move$/, async (route) => {
      if (route.request().method() === 'POST') moves.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })

    await openEntity(page, moving.id, moving.display_name)
    await entityAction(page, 'Move')
    const dialog = page.getByRole('dialog', { name: `Move ${moving.display_name}` })
    await expect(dialog.getByTestId('move-impact')).toContainText('and the 1 entity beneath it move together')
    // Unchanged: nothing to submit.
    await expect(dialog.getByRole('button', { name: 'Move entity' })).toBeDisabled()

    await dialog.getByLabel('New parent', { exact: true }).click()
    await expect(entityOption(page, target.display_name)).toBeVisible()
    // F-076: never its own branch or an access group (structural entity).
    await expect(entityOption(page, moving.display_name)).toHaveCount(0)
    await expect(entityOption(page, below.display_name)).toHaveCount(0)
    await expect(entityOption(page, group.display_name)).toHaveCount(0)
    await entityOption(page, target.display_name).click()
    await dialog.getByRole('button', { name: 'Move entity' }).click()

    await expect(dialog).toBeHidden()
    expect(moves).toEqual([{ new_parent_id: target.id }])
    // F-077: the breadcrumb follows the new place.
    await expect(page.getByRole('navigation').getByRole('link', { name: target.display_name })).toBeVisible()
  })

  test('archive: cascade archives the branch, revokes memberships, and the entity becomes read-only', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'ar-root' })
    const branch = await api.createEntity({ kind: 'ar-branch', entity_type: 'office', parent_entity_id: root.id })
    const leaf = await api.createEntity({ kind: 'ar-leaf', entity_type: 'team', parent_entity_id: branch.id })
    const member = await api.createUser({ kind: 'ar-member', root_entity_id: root.id })
    await api.post('/memberships/', { user_id: member.id, entity_id: branch.id, role_ids: [], status: 'active' })
    const deletes: string[] = []
    await page.route(/\/entities\/[0-9a-f-]+\?cascade=/, async (route) => {
      if (route.request().method() === 'DELETE') deletes.push(route.request().url())
      await route.continue()
    })

    await openEntity(page, branch.id, branch.display_name)
    await entityAction(page, 'Archive')
    const confirm = page.getByRole('dialog', { name: `Archive ${branch.display_name}` })
    const effects = confirm.getByTestId('confirm-effects')
    await expect(effects).toContainText('Its 1 active membership is archived')
    await expect(effects).toContainText('API keys anchored to this entity are revoked')
    await expect(effects).toContainText(`1 active entity beneath it is archived too, with the same effects: ${leaf.display_name}.`)
    await expect(effects).toContainText('there is no restore')
    const archiveButton = confirm.getByRole('button', { name: 'Archive entity' })
    await expect(archiveButton).toBeDisabled()
    const typed = confirm.getByLabel(`Type ${branch.slug} to confirm`)
    const cascade = confirm.getByRole('checkbox', { name: /Also archive the 1 active entity beneath it/ })
    // The acknowledgement comes after the effects it acknowledges, and before the typed confirmation.
    const top = async (locator: typeof effects) => (await locator.boundingBox())?.y ?? Number.NaN
    expect(await top(effects)).toBeLessThan(await top(cascade))
    expect(await top(cascade)).toBeLessThan(await top(typed))
    await typed.fill(branch.slug)
    // The cascade must be acknowledged: the server refuses an entity with active children otherwise.
    await expect(archiveButton).toBeDisabled()
    await cascade.check()
    await archiveButton.click()

    await expect(confirm).toBeHidden()
    expect(deletes).toHaveLength(1)
    expect(new URL(deletes[0]!).searchParams.get('cascade')).toBe('true')
    // Lands on the parent.
    await expect(page.getByRole('heading', { name: root.display_name, exact: true })).toBeVisible()
    await expect(treeRow(page, branch.display_name)).toHaveCount(0)

    // Server-side effects.
    expect((await api.get<{ status: string }>(`/entities/${branch.id}`)).status).toBe('archived')
    expect((await api.get<{ status: string }>(`/entities/${leaf.id}`)).status).toBe('archived')
    const memberships = await api.get<Array<{ entity_id: string, status: string }>>(`/memberships/user/${member.id}`, { query: { include_inactive: true } })
    const revoked = memberships.find(m => m.entity_id === branch.id)
    expect(revoked?.status).not.toBe('active')

    // An archived entity opens read-only.
    await openEntity(page, branch.id, branch.display_name)
    await expect(page.getByTestId('entity-archived')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'More entity actions' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add member' })).toHaveCount(0)
  })

  test('archive without active children sends no cascade', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'ar1-root' })
    const leaf = await api.createEntity({ kind: 'ar1-leaf', entity_type: 'office', parent_entity_id: root.id })
    const deletes: string[] = []
    await page.route(/\/entities\/[0-9a-f-]+\?cascade=/, async (route) => {
      if (route.request().method() === 'DELETE') deletes.push(route.request().url())
      await route.continue()
    })
    await openEntity(page, leaf.id, leaf.display_name)
    await entityAction(page, 'Archive')
    const confirm = page.getByRole('dialog', { name: `Archive ${leaf.display_name}` })
    await expect(confirm.getByRole('checkbox')).toHaveCount(0)
    await expect(confirm.getByTestId('confirm-effects')).toContainText('It has no active memberships to archive.')
    await confirm.getByLabel(`Type ${leaf.slug} to confirm`).fill(leaf.slug)
    await confirm.getByRole('button', { name: 'Archive entity' }).click()
    await expect(confirm).toBeHidden()
    expect(new URL(deletes[0]!).searchParams.get('cascade')).toBe('false')
  })

  test('an entity archived by a status change still grants access; Finish archiving revokes it', async ({ page, api }) => {
    // Before F-004 the Edit dialog could PATCH status=archived, which revokes nothing.
    const root = await api.createEntity({ kind: 'ar2-root' })
    const leaf = await api.createEntity({ kind: 'ar2-leaf', entity_type: 'office', parent_entity_id: root.id })
    const member = await api.createUser({ kind: 'ar2-member', root_entity_id: root.id })
    await api.post('/memberships/', { user_id: member.id, entity_id: leaf.id, role_ids: [], status: 'active' })
    await api.patch(`/entities/${leaf.id}`, { status: 'archived' })
    const deletes: string[] = []
    await page.route(/\/entities\/[0-9a-f-]+\?cascade=/, async (route) => {
      if (route.request().method() === 'DELETE') deletes.push(route.request().url())
      await route.continue()
    })

    await openEntity(page, leaf.id, leaf.display_name)
    const residual = page.getByTestId('entity-archived-residual')
    await expect(residual).toContainText('Archived, but its access is still live')
    await expect(residual).toContainText('1 membership is still active')
    await expect(page.getByTestId('entity-archived')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0)

    await residual.getByRole('button', { name: 'Finish archiving' }).click()
    const confirm = page.getByRole('dialog', { name: `Finish archiving ${leaf.display_name}` })
    await expect(confirm.getByTestId('confirm-effects')).toContainText('Its 1 active membership is archived')
    await confirm.getByLabel(`Type ${leaf.slug} to confirm`).fill(leaf.slug)
    await confirm.getByRole('button', { name: 'Finish archiving' }).click()
    await expect(confirm).toBeHidden()
    expect(deletes).toHaveLength(1)

    // It stays in view, now fully archived.
    await expect(page.getByTestId('entity-archived')).toBeVisible()
    await expect(residual).toHaveCount(0)
    const memberships = await api.get<Array<{ entity_id: string, status: string }>>(`/memberships/user/${member.id}`, { query: { include_inactive: true } })
    expect(memberships.find(m => m.entity_id === leaf.id)?.status).not.toBe('active')
  })

  test('children are links that select the child, and the breadcrumb leads back up', async ({ page, api }) => {
    const root = await api.createEntity({ kind: 'bc-root' })
    const middle = await api.createEntity({ kind: 'bc-mid', entity_type: 'region', parent_entity_id: root.id })
    const leaf = await api.createEntity({ kind: 'bc-leaf', entity_type: 'office', parent_entity_id: middle.id })

    await openEntity(page, middle.id, middle.display_name)
    const childLink = page.getByRole('link', { name: leaf.display_name })
    await childLink.click()
    await expect(page).toHaveURL(new RegExp(`entity=${leaf.id}`))
    await expect(page.getByRole('heading', { name: leaf.display_name, exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()

    // F-077: the breadcrumb names the path and links each ancestor.
    await page.getByRole('navigation').getByRole('link', { name: root.display_name }).click()
    await expect(page).toHaveURL(new RegExp(`entity=${root.id}`))
    await expect(page.getByRole('heading', { name: root.display_name, exact: true })).toBeVisible()
  })

  test('the read view shows capacity; Add member is disabled at the limit', async ({ page, api, requires }) => {
    await requires({ surfaces: ['memberships'] })
    const entity = await api.createEntity({ kind: 'cap', max_members: 1 })
    const member = await api.createUser({ kind: 'cap-member', root_entity_id: entity.id })
    await api.post('/memberships/', { user_id: member.id, entity_id: entity.id, role_ids: [], status: 'active' })
    await openEntity(page, entity.id, entity.display_name)
    await expect(page.getByText('1 of 1', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add member' })).toBeDisabled()
  })

  test('entity members link through to the user detail page', async ({ page, requires }) => {
    await requires({ surfaces: ['memberships'] })
    // The San Francisco Office is a seeded entity with a direct member (manager@sf.acme.com).
    await page.goto('/app/entities')
    await page.getByRole('searchbox', { name: 'Search entities' }).fill('San Francisco Office')
    await treeRow(page, 'San Francisco Office').click()

    await expect(page.getByRole('heading', { name: 'Users', exact: true })).toBeVisible()
    const memberRow = page.getByRole('row').filter({ hasText: 'manager@sf.acme.com' })
    await expect(memberRow).toBeVisible()
    await memberRow.getByRole('link').first().click()
    await expect(page).toHaveURL(/\/app\/users\/[0-9a-f-]+/)
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible()
  })

  test('a superuser switches organisations; the selection follows a deep link\'s organisation', async ({ page, api }) => {
    const other = await api.createEntity({ kind: 'switch-root' })
    const child = await api.createEntity({ kind: 'switch-child', entity_type: 'office', parent_entity_id: other.id })
    await openEntity(page, child.id, child.display_name)
    await expect(page.getByRole('button', { name: 'Organization' })).toContainText(other.display_name)
    await expect(treeRow(page, child.display_name)).toHaveAttribute('aria-selected', 'true')

    await pickEntityRoot(page, 'ACME Realty')
    await expect(treeRow(page, 'ACME Realty')).toBeVisible()
    await expect(treeRow(page, other.display_name)).toHaveCount(0)
    await expect(page).not.toHaveURL(/entity=/)
  })
})

async function pickEntityRoot(page: Page, name: string) {
  await page.getByRole('button', { name: 'Organization' }).click()
  await page.getByRole('combobox', { name: 'Search organizations' }).fill(name)
  await page.getByRole('option', { name: new RegExp(`^${name}`) }).click()
}
