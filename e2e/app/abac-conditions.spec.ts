import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { backendCapabilities, backendConfigured, expect, expectSeeded, personaState, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'
import { runId } from '../support/env'
import { testData } from '../support/test-data'
import { chooseSelect, field } from '../support/ui-select'

// ABAC conditions editor (chromium project, admin storageState — superuser, so role:update /
// permission:update pass). Runs only where the backend reports the abac feature (EnterpriseRBAC);
// SimpleRBAC has no ABAC surface and skips. The full lifecycle runs on freshly created
// (non-system, holder-less) permissions and asserts the stored rows through GET: the backend
// refuses malformed conditions (400), and the UI must never send one.
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

// The ConditionOperator enum (outlabs_auth/models/sql/enums.py).
const OPERATORS = [
  'equals', 'not_equals', 'less_than', 'less_than_or_equal', 'greater_than', 'greater_than_or_equal',
  'in', 'not_in', 'contains', 'not_contains', 'starts_with', 'ends_with', 'matches',
  'exists', 'not_exists', 'is_true', 'is_false', 'before', 'after'
]

type StoredCondition = {
  id: string
  attribute: string
  operator: string
  value: string | null
  value_type: string
  description: string | null
  condition_group_id: string | null
}
type StoredGroup = { id: string, operator: string, description: string | null }

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}`, ...init.headers }
  })
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed: ${res.status}`)
  return (res.status === 204 ? undefined : await res.json()) as T
}

// Run-marked (the run's cleanup removes them). Permission names follow resource:action with one
// colon and no hyphens, which testData.resource() satisfies.
const runData = testData(runId)

async function createPermission(): Promise<string> {
  const perm = await api<{ id: string }>('/permissions/', {
    method: 'POST',
    body: JSON.stringify({ name: `${runData.resource('abac')}:read`, display_name: runData.displayName('abac'), description: '' })
  })
  return perm.id
}

const listConditions = (permissionId: string) => api<StoredCondition[]>(`/permissions/${permissionId}/conditions`)
const listGroups = (permissionId: string) => api<StoredGroup[]>(`/permissions/${permissionId}/condition-groups`)

async function abacEnabled(): Promise<boolean> {
  const caps = (await backendCapabilities()) as { features?: { abac?: boolean } } | null
  return Boolean(caps?.features?.abac)
}

// Operator options render a readable label with the enum value as the description.
async function chooseOperator(page: Page, operator: string) {
  await page.getByLabel('Operator', { exact: true }).click()
  await page.getByRole('option').filter({ has: page.getByText(operator, { exact: true }) }).click()
}

async function openConditionMenu(page: Page, attribute: string) {
  await page.getByRole('button', { name: `Actions for condition ${attribute}` }).click()
}

type ConditionBody = { attribute: string, operator: string, value: unknown, value_type: string }

// Serves a stored condition the engine cannot evaluate, as the console would read a row written
// before outlabs-auth 0.1.0a35: the write API refuses one now (400 with the reason, checked
// here), and such rows evaluate false. A valid row is stored and served as the legacy one until
// the console saves its fix (PATCH).
async function storeUnevaluable(page: Page, permissionId: string, legacy: ConditionBody, refusal: RegExp, valid: ConditionBody) {
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/permissions/${permissionId}/conditions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminAccessToken()}` },
    body: JSON.stringify(legacy)
  })
  expect(res.status, 'the write API refuses the legacy row').toBe(400)
  expect(((await res.json()) as { message?: string }).message).toMatch(refusal)
  const stored = await api<StoredCondition>(`/permissions/${permissionId}/conditions`, { method: 'POST', body: JSON.stringify(valid) })
  let fixed = false
  page.on('request', (request) => {
    if (request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith(`/conditions/${stored.id}`)) fixed = true
  })
  const asStored = { operator: legacy.operator, value: legacy.value == null ? null : String(legacy.value), value_type: legacy.value_type }
  await page.route(url => url.pathname.endsWith(`/permissions/${permissionId}/conditions`), async (route) => {
    if (route.request().method() !== 'GET' || fixed) return route.fallback()
    const response = await route.fetch()
    const rows = await response.json() as StoredCondition[]
    return route.fulfill({ response, json: rows.map(row => (row.id === stored.id ? { ...row, ...asStored } : row)) })
  })
}

test.describe('abac conditions', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')
  test.beforeEach(async () => {
    test.skip(!(await abacEnabled()), 'The backend does not expose ABAC (e.g. SimpleRBAC).')
  })

  test('the operator control offers exactly the ConditionOperator values', async ({ page }) => {
    const permissionId = await createPermission()
    await page.goto(`/app/permissions/${permissionId}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()
    await expect(page.getByText('How conditions are evaluated')).toBeVisible()

    await page.getByRole('button', { name: 'Add condition' }).first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Add condition' })).toBeVisible()
    await page.getByLabel('Operator', { exact: true }).click()
    const options = page.getByRole('option')
    await expect(options).toHaveCount(OPERATORS.length)
    for (const operator of OPERATORS) {
      await expect(options.filter({ has: page.getByText(operator, { exact: true }) })).toHaveCount(1)
    }
    await page.keyboard.press('Escape')

    // The attribute context is a fixed choice too — no free-text prefix, and only the contexts the
    // server fills in (no request.).
    await page.getByLabel('Context', { exact: true }).click()
    await expect(page.getByRole('option')).toHaveText([/^user/, /^resource/, /^env/, /^time/])
  })

  test('permission: add, edit and move a condition, then delete its group with the cascade stated', async ({ page }) => {
    const permissionId = await createPermission()
    await page.goto(`/app/permissions/${permissionId}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()
    await expect(page.getByText('No conditions', { exact: true })).toBeVisible()

    // Add an OR group.
    await page.getByRole('button', { name: 'Add group' }).first().click()
    let dialog = page.getByRole('dialog')
    await dialog.getByText('Any condition can pass (OR)').click()
    await dialog.getByLabel('Description', { exact: true }).fill('env checks')
    await dialog.getByRole('button', { name: 'Add group' }).click()
    await expect(dialog).toBeHidden()
    const groupSection = page.getByRole('region', { name: 'Group 1' })
    await expect(groupSection.getByText('env checks')).toBeVisible()
    await expect(groupSection.getByText('Any condition can pass')).toBeVisible()
    const [group] = await listGroups(permissionId)
    expect(group).toMatchObject({ operator: 'OR', description: 'env checks' })

    // Add an ungrouped equals condition.
    await page.getByRole('button', { name: 'Add condition', exact: true }).first().click()
    dialog = page.getByRole('dialog')
    await chooseSelect(page, field(page, 'Context'), 'resource')
    await dialog.getByLabel('Attribute', { exact: true }).fill('department')
    await chooseOperator(page, 'equals')
    await dialog.getByLabel('Value', { exact: true }).fill('sales')
    await chooseSelect(page, field(page, 'Group'), 'Ungrouped (all must pass)')
    await dialog.getByLabel('Description', { exact: true }).fill('Sales only')
    await dialog.getByRole('button', { name: 'Add condition' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('region', { name: 'Ungrouped' }).getByText('resource.department')).toBeVisible()
    await expect(page.getByText('Sales only')).toBeVisible()
    let [stored] = await listConditions(permissionId)
    expect(stored).toMatchObject({ attribute: 'resource.department', operator: 'equals', value: 'sales', value_type: 'string', description: 'Sales only', condition_group_id: null })

    // Edit it: new value, and move it into the group from the form.
    await openConditionMenu(page, 'resource.department')
    await page.getByRole('menuitem', { name: 'Edit condition' }).click()
    dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await dialog.getByLabel('Value', { exact: true }).fill('ops')
    await chooseSelect(page, field(page, 'Group'), 'Group 1 · any condition can pass')
    const patches: Array<Record<string, unknown>> = []
    await page.route(/\/conditions\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') patches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    // Only the changed fields travel; value and value_type always together.
    expect(patches[0]).toEqual({ operator: 'equals', value_type: 'string', value: 'ops', condition_group_id: group!.id })
    await expect(groupSection.getByText('resource.department')).toBeVisible()
    ;[stored] = await listConditions(permissionId)
    expect(stored).toMatchObject({ value: 'ops', condition_group_id: group!.id, description: 'Sales only' })

    // Move it out of the group from the row menu, then back in.
    await openConditionMenu(page, 'resource.department')
    await page.getByRole('menuitem', { name: 'Move to' }).click()
    await page.getByRole('menuitem', { name: 'Ungrouped (all must pass)' }).click()
    await expect(page.getByRole('region', { name: 'Ungrouped' }).getByText('resource.department')).toBeVisible()
    await expect.poll(async () => (await listConditions(permissionId))[0]?.condition_group_id).toBeNull()

    await openConditionMenu(page, 'resource.department')
    await page.getByRole('menuitem', { name: 'Move to' }).click()
    await page.getByRole('menuitem', { name: 'Group 1 (any condition can pass)' }).click()
    await expect(groupSection.getByText('resource.department')).toBeVisible()
    await expect.poll(async () => (await listConditions(permissionId))[0]?.condition_group_id).toBe(group!.id)

    // Edit the group: switch OR to AND. Only the changed field travels.
    const groupPatches: Array<Record<string, unknown>> = []
    await page.route(/\/condition-groups\/[^/]+$/, async (route) => {
      if (route.request().method() === 'PATCH') groupPatches.push(route.request().postDataJSON() as Record<string, unknown>)
      await route.continue()
    })
    await page.getByRole('button', { name: 'Actions for group 1' }).click()
    await page.getByRole('menuitem', { name: 'Edit group' }).click()
    dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Edit condition group' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await dialog.getByText('All conditions must pass (AND)').click()
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    expect(groupPatches).toEqual([{ operator: 'AND' }])
    await expect(groupSection.getByText('All conditions must pass')).toBeVisible()
    expect((await listGroups(permissionId))[0]).toMatchObject({ operator: 'AND', description: 'env checks' })

    // Delete the group: the confirm states the cascade before anything is removed.
    await page.getByRole('button', { name: 'Actions for group 1' }).click()
    await page.getByRole('menuitem', { name: 'Delete group' }).click()
    dialog = page.getByRole('dialog')
    await expect(dialog.getByRole('heading', { name: 'Delete group 1' })).toBeVisible()
    await expect(dialog.getByText('Its 1 condition will be deleted with it.')).toBeVisible()
    await expect(dialog.getByText(/may gain access they don't have today/)).toBeVisible()
    await dialog.getByRole('button', { name: 'Delete group' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('No conditions', { exact: true })).toBeVisible()
    expect(await listGroups(permissionId)).toEqual([])
    expect(await listConditions(permissionId)).toEqual([])
  })

  test('deleting a condition from an OR group says whether access tightens or loosens', async ({ page }) => {
    const permissionId = await createPermission()
    const group = await api<StoredGroup>(`/permissions/${permissionId}/condition-groups`, { method: 'POST', body: JSON.stringify({ operator: 'OR', description: 'Either check' }) })
    for (const attribute of ['env.on_call', 'user.is_superuser']) {
      await api(`/permissions/${permissionId}/conditions`, { method: 'POST', body: JSON.stringify({ attribute, operator: 'is_true', value_type: 'boolean', condition_group_id: group.id }) })
    }
    await page.goto(`/app/permissions/${permissionId}`)
    const groupSection = page.getByRole('region', { name: 'Group 1' })
    await expect(groupSection.getByText('env.on_call')).toBeVisible()

    // One of two alternatives: deleting it tightens access (the engine ORs the group).
    await openConditionMenu(page, 'env.on_call')
    await page.getByRole('menuitem', { name: 'Delete condition' }).click()
    let confirm = page.getByRole('dialog')
    await expect(confirm.getByText('Holders of this permission who meet only this condition in the group will lose access they have today.', { exact: false })).toBeVisible()
    await expect(confirm.getByText('Holders who meet the other condition in Group 1 are not affected.')).toBeVisible()
    await expect(confirm.getByText(/may gain access/)).toHaveCount(0)
    await confirm.getByRole('button', { name: 'Delete condition' }).click()
    await expect(confirm).toBeHidden()
    await expect(groupSection.getByText('env.on_call')).toHaveCount(0)

    // The last one left: the group empties, so access loosens instead.
    await openConditionMenu(page, 'user.is_superuser')
    await page.getByRole('menuitem', { name: 'Delete condition' }).click()
    confirm = page.getByRole('dialog')
    await expect(confirm.getByText(/This is the last condition in Group 1/)).toBeVisible()
    await expect(confirm.getByText(/may gain access they don't have today/)).toBeVisible()
    await expect(confirm.getByText(/will lose access/)).toHaveCount(0)
    await confirm.getByRole('button', { name: 'Cancel' }).click()
    await expect(confirm).toBeHidden()
    expect((await listConditions(permissionId)).map(c => c.attribute)).toEqual(['user.is_superuser'])
  })

  test('not_in with a list round-trips as a JSON array', async ({ page }) => {
    const permissionId = await createPermission()
    await page.goto(`/app/permissions/${permissionId}`)
    await page.getByRole('button', { name: 'Add condition' }).first().click()
    const dialog = page.getByRole('dialog')
    await chooseSelect(page, field(page, 'Context'), 'resource')
    await dialog.getByLabel('Attribute', { exact: true }).fill('region')
    await chooseOperator(page, 'not_in')
    // Lists have no free value-type choice.
    await expect(dialog.getByLabel('Value type', { exact: true })).toHaveCount(0)

    // An empty list is refused client-side (it would silently pass for everyone).
    await dialog.getByRole('button', { name: 'Add condition' }).click()
    await expect(dialog.getByText('Add at least one value.')).toBeVisible()

    // UInputTags puts the id on its text input.
    const tags = dialog.getByLabel('Value', { exact: true })
    await tags.fill('west')
    await tags.press('Enter')
    await tags.fill('east')
    await tags.press('Enter')
    // The form is complete now: Enter again on the emptied field still adds nothing and must not
    // submit it (AppFormDialog), or the Add condition click below would find no dialog.
    await tags.press('Enter')
    await expect(tags).toBeEnabled()
    await dialog.getByRole('button', { name: 'Add condition' }).click()
    await expect(dialog).toBeHidden()

    const [stored] = await listConditions(permissionId)
    expect(stored).toMatchObject({ attribute: 'resource.region', operator: 'not_in', value_type: 'list' })
    expect(JSON.parse(stored!.value!)).toEqual(['west', 'east'])
    const row = page.getByTestId('abac-condition').filter({ hasText: 'resource.region' })
    await expect(row.getByText('is not one of')).toBeVisible()
    await expect(row.getByText('west', { exact: true })).toBeVisible()
    await expect(row.getByText('east', { exact: true })).toBeVisible()
  })

  test('numbers and booleans are stored typed', async ({ page }) => {
    const permissionId = await createPermission()
    await page.goto(`/app/permissions/${permissionId}`)

    // Comparisons take a number (whole number by default).
    await page.getByRole('button', { name: 'Add condition' }).first().click()
    let dialog = page.getByRole('dialog')
    await chooseSelect(page, field(page, 'Context'), 'time')
    await dialog.getByLabel('Attribute', { exact: true }).fill('hour')
    await chooseOperator(page, 'less_than')
    await dialog.getByLabel('Value', { exact: true }).fill('17')
    await dialog.getByRole('button', { name: 'Add condition' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByTestId('abac-condition').filter({ hasText: 'time.hour' }).getByText('is less than')).toBeVisible()

    // A boolean equality uses a switch.
    await page.getByRole('button', { name: 'Add condition' }).first().click()
    dialog = page.getByRole('dialog')
    await chooseSelect(page, field(page, 'Context'), 'user')
    await dialog.getByLabel('Attribute', { exact: true }).fill('is_superuser')
    await chooseSelect(page, field(page, 'Value type'), 'True or false')
    await dialog.getByLabel('Value', { exact: true }).click()
    await dialog.getByRole('button', { name: 'Add condition' }).click()
    await expect(dialog).toBeHidden()

    const stored = await listConditions(permissionId)
    expect(stored.find(c => c.attribute === 'time.hour')).toMatchObject({ operator: 'less_than', value: '17', value_type: 'integer' })
    expect(stored.find(c => c.attribute === 'user.is_superuser')).toMatchObject({ operator: 'equals', value: 'False', value_type: 'boolean' })
  })

  test('stored conditions the engine cannot evaluate are flagged', async ({ page }) => {
    const permissionId = await createPermission()
    // An unknown operator: the engine evaluates the row false. Safe here: nobody holds this
    // permission.
    await storeUnevaluable(page, permissionId,
      { attribute: 'user.department', operator: 'eq', value: 'sales', value_type: 'string' },
      /Unknown ABAC operator 'eq'/,
      { attribute: 'user.department', operator: 'not_equals', value: 'sales', value_type: 'string' })
    await page.goto(`/app/permissions/${permissionId}`)
    await expect(page.getByText('1 condition cannot be evaluated')).toBeVisible()
    await expect(page.getByText('"eq" is not a supported operator.', { exact: false })).toBeVisible()

    // Editing makes the admin pick a real operator before saving.
    await openConditionMenu(page, 'user.department')
    await page.getByRole('menuitem', { name: 'Edit condition' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('This condition needs fixing')).toBeVisible()
    await expect(dialog.getByText('Choose an operator.')).toBeVisible()
    await chooseOperator(page, 'equals')
    await dialog.getByRole('button', { name: 'Save changes' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('1 condition cannot be evaluated')).toBeHidden()
    const [stored] = await listConditions(permissionId)
    expect(stored).toMatchObject({ operator: 'equals', value: 'sales', value_type: 'string' })
  })

  test('a flagged row that loading already corrects can be saved without other edits', async ({ page }) => {
    const permissionId = await createPermission()
    // "in" stored with value_type string: the engine evaluates it false. The form loads it as a
    // list.
    await storeUnevaluable(page, permissionId,
      { attribute: 'resource.region', operator: 'in', value: 'west', value_type: 'string' },
      /Operator 'in' requires value_type 'list'/,
      { attribute: 'resource.region', operator: 'in', value: ['west', 'east'], value_type: 'list' })
    await page.goto(`/app/permissions/${permissionId}`)
    await expect(page.getByText('1 condition cannot be evaluated')).toBeVisible()

    await openConditionMenu(page, 'resource.region')
    await page.getByRole('menuitem', { name: 'Edit condition' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('This condition needs fixing')).toBeVisible()
    const save = dialog.getByRole('button', { name: 'Save changes' })
    await expect(save).toBeEnabled()
    await save.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('1 condition cannot be evaluated')).toBeHidden()
    const [stored] = await listConditions(permissionId)
    expect(stored).toMatchObject({ operator: 'in', value_type: 'list' })
    expect(JSON.parse(stored!.value!)).toEqual(['west'])
  })

  test('the editor and its condition dialog have no a11y violations', async ({ page }) => {
    const permissionId = await createPermission()
    const group = await api<StoredGroup>(`/permissions/${permissionId}/condition-groups`, { method: 'POST', body: JSON.stringify({ operator: 'OR', description: 'Either check' }) })
    await api(`/permissions/${permissionId}/conditions`, { method: 'POST', body: JSON.stringify({ attribute: 'resource.region', operator: 'in', value: ['west', 'east'], value_type: 'list' }) })
    await api(`/permissions/${permissionId}/conditions`, { method: 'POST', body: JSON.stringify({ attribute: 'env.on_call', operator: 'is_true', value_type: 'boolean', condition_group_id: group.id }) })
    await page.goto(`/app/permissions/${permissionId}`)
    await expect(page.getByText('resource.region')).toBeVisible()
    // color-contrast stays out of the gate here too (F-032, an accepted limitation; e2e/support/a11y.ts).
    const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).disableRules(['color-contrast']).analyze()
    const violations = (r: Awaited<ReturnType<typeof axe>>) => r.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target.join(' ')) }))
    expect(violations(await axe())).toEqual([])

    await page.getByRole('button', { name: 'Add condition' }).first().click()
    await expect(page.getByRole('dialog').getByLabel('Attribute', { exact: true })).toBeVisible()
    expect(violations(await axe())).toEqual([])
  })

  test('a system permission explains why its conditions are read-only', async ({ page }) => {
    const data = await api<{ items: Array<{ id: string, is_system: boolean }> }>('/permissions/?limit=100')
    const system = data.items.find(p => p.is_system)
    expectSeeded(system, 'the seed has system permissions')
    await page.goto(`/app/permissions/${system!.id}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()
    await expect(page.getByText('Read-only')).toBeVisible()
    await expect(page.getByText(/This is a system permission/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add condition' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add group' })).toHaveCount(0)
  })

  test('role: the editor renders grouped conditions with their descriptions', async ({ page }) => {
    const data = await api<{ items: Array<{ id: string, name: string }> }>('/roles/?limit=100')
    // The enterprise seed attaches an AND group with two described conditions to this role.
    const role = data.items.find(r => r.name === 'west_coast_after_hours')
    expectSeeded(role, 'the seed has the west_coast_after_hours role')
    await page.goto(`/app/roles/${role!.id}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()
    await expect(page.getByText('These conditions must pass before this role grants any of its permissions.', { exact: false })).toBeVisible()
    const group = page.getByRole('region', { name: 'Group 1' })
    await expect(group.getByText('All conditions must pass')).toBeVisible()
    await expect(group.getByText('env.request_origin')).toBeVisible()
    await expect(group.getByText('Restrict to backoffice-originated requests.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add condition' })).toBeVisible()
  })
})

// Delegated, non-superuser admin: the EnterpriseRBAC seed's permission catalog admin holds
// permission:read/create/update/delete plus role:read (no role:update). Runs from the
// permissionsAdmin persona's minted storage state (no login).
test.describe('abac conditions (delegated permission admin)', () => {
  test.use({ storageState: personaState('permissionsAdmin') })

  test.beforeEach(async ({ requires }) => {
    await requires({ features: ['abac'], personas: ['permissionsAdmin'] })
  })

  test('adds and deletes a condition on a custom permission', async ({ page }) => {
    const permissionId = await createPermission()
    await page.goto(`/app/permissions/${permissionId}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()
    await expect(page.getByText('Read-only')).toHaveCount(0)

    await page.getByRole('button', { name: 'Add condition' }).first().click()
    const dialog = page.getByRole('dialog')
    await chooseSelect(page, field(page, 'Context'), 'env')
    await dialog.getByLabel('Attribute', { exact: true }).fill('on_call')
    await chooseOperator(page, 'is_true')
    // Presence / boolean operators take no value.
    await expect(dialog.getByLabel('Value', { exact: true })).toHaveCount(0)
    await dialog.getByRole('button', { name: 'Add condition' }).click()
    await expect(dialog).toBeHidden()
    const [stored] = await listConditions(permissionId)
    expect(stored).toMatchObject({ attribute: 'env.on_call', operator: 'is_true', value: null })

    await openConditionMenu(page, 'env.on_call')
    await page.getByRole('menuitem', { name: 'Delete condition' }).click()
    const confirm = page.getByRole('dialog')
    await expect(confirm.getByText(/may gain access they don't have today/)).toBeVisible()
    await confirm.getByRole('button', { name: 'Delete condition' }).click()
    await expect(confirm).toBeHidden()
    await expect(page.getByText('No conditions', { exact: true })).toBeVisible()
    expect(await listConditions(permissionId)).toEqual([])
  })

  test('is told why role and system-permission conditions are read-only', async ({ page }) => {
    const roles = await api<{ items: Array<{ id: string, is_system_role: boolean }> }>('/roles/?limit=100')
    const role = roles.items.find(r => !r.is_system_role)
    expectSeeded(role, 'the seed has roles that are not system roles')
    await page.goto(`/app/roles/${role!.id}`)
    await expect(page.getByRole('heading', { name: 'ABAC conditions' })).toBeVisible()
    await expect(page.getByText('You need the role:update permission to change these conditions.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add condition' })).toHaveCount(0)

    const permissions = await api<{ items: Array<{ id: string, is_system: boolean }> }>('/permissions/?limit=100')
    const system = permissions.items.find(p => p.is_system)
    expectSeeded(system, 'the seed has system permissions')
    await page.goto(`/app/permissions/${system!.id}`)
    await expect(page.getByText(/This is a system permission/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add condition' })).toHaveCount(0)
  })
})
