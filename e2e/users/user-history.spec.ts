import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'
import { backendHasSurface } from '../support/capabilities'
import { cardByHeading } from '../support/entities'
import { userDetailPath } from '../support/users'

// Per-user retained histories (gap-backlog #3) on the user detail's History tab. State is
// arranged and contract-checked through the API; the browser verifies the user-detail surface
// renders those same streams, with the actor of each change and a category filter (WP-12).
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

type AuthConfigResponse = {
  features?: { activity_tracking?: boolean, entity_hierarchy?: boolean }
}

type Entity = { id: string, display_name?: string, parent_entity_id?: string | null }

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ response: Response, data: T }> {
  const response = await fetch(`${apiBaseUrl}${authApiPrefix}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${adminAccessToken()}`, ...init?.headers }
  })
  return { response, data: await response.json() as T }
}

test.describe('user history', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  // Every preset with activity tracking (SimpleRBAC too): the audit timeline alone.
  test('the audit timeline names the actor, narrows by category on the server and links to Audit (F-172, F-192)', async ({ page, api, requires }) => {
    await requires({ features: ['activity_tracking'], surfaces: ['users'] })
    const user = await api.createUser({ kind: 'audit-history' })
    await api.patch(`/users/${user.id}/status`, { status: 'suspended', reason: 'E2E history audit event' })

    await page.goto(userDetailPath(user.id, 'history'))
    const card = cardByHeading(page, 'Audit timeline')
    await expect(card.getByRole('heading', { name: 'Status changed' }).first()).toBeVisible()
    // The admin persona made the change: named "You", never a raw id.
    await expect(card.getByRole('article').first().getByRole('link', { name: 'You', exact: true })).toBeVisible()

    // The Audit workspace for events about this user, or actions taken by them; only where the
    // backend mounts it (SimpleRBAC has no Audit workspace).
    const openInAudit = card.getByRole('button', { name: 'Open in Audit' })
    if (await backendHasSurface('audit')) {
      await openInAudit.click()
      await expect(page.getByRole('menuitem', { name: 'Events about this user' })).toHaveAttribute('href', `/app/audit?subjectUserId=${user.id}`)
      await expect(page.getByRole('menuitem', { name: 'Actions by this user' })).toHaveAttribute('href', `/app/audit?actorUserId=${user.id}`)
      await page.keyboard.press('Escape')
    } else {
      await expect(openInAudit).toHaveCount(0)
    }

    // The category narrows the timeline on the server ...
    const category = card.getByRole('combobox', { name: 'Audit category' })
    const statusOnly = page.waitForResponse(response => response.url().includes(`/users/${user.id}/audit-events`) && response.url().includes('category=status') && response.ok())
    await category.click()
    await page.getByRole('option', { name: 'Status', exact: true }).click()
    await statusOnly
    await expect(card.getByRole('heading', { name: 'Status changed' }).first()).toBeVisible()

    // ... and a category without events says so, with a way back to all of them.
    const privilegeOnly = page.waitForResponse(response => response.url().includes(`/users/${user.id}/audit-events`) && response.url().includes('category=privilege') && response.ok())
    await category.click()
    await page.getByRole('option', { name: 'Superuser', exact: true }).click()
    await privilegeOnly
    await expect(card.getByText('No events in this category')).toBeVisible()
    await card.getByRole('button', { name: 'Show all categories' }).click()
    await expect(card.getByRole('heading', { name: 'Status changed' }).first()).toBeVisible()
    await expect(category).toContainText('All categories')
  })

  test('renders retained audit and membership histories from the user endpoints (EnterpriseRBAC)', async ({ page, testData }) => {
    const configResponse = await fetch(`${apiBaseUrl}${authApiPrefix}/auth/config`)
    const config = configResponse.ok ? await configResponse.json() as AuthConfigResponse : null
    test.skip(!config?.features?.activity_tracking || !config.features.entity_hierarchy,
      'Needs activity_tracking and entity_hierarchy capabilities.')

    const entities = await apiJson<{ items?: Entity[] }>('/entities/?limit=100')
    expect(entities.response.ok, 'list entities').toBe(true)
    const root = entities.data.items?.find(entity => !entity.parent_entity_id)
    const memberEntity = entities.data.items?.find(entity => entity.parent_entity_id === root?.id)
    expect(root, 'seeded root entity').toBeTruthy()
    expect(memberEntity, 'seeded child entity').toBeTruthy()

    const created = await apiJson<{ id?: string }>('/users/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testData.email('history'),
        password: 'Testpass1!',
        root_entity_id: root!.id
      })
    })
    expect(created.response.ok, 'create user').toBe(true)
    const userId = created.data.id ?? ''
    expect(userId, 'created user id').toBeTruthy()

    // This creates a retained lifecycle entry; the status mutation also guarantees a user audit event.
    const membership = await apiJson('/memberships/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, entity_id: memberEntity!.id, role_ids: [], status: 'active' })
    })
    expect(membership.response.ok, 'create membership').toBe(true)
    const status = await apiJson(`/users/${userId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'suspended', reason: 'E2E history audit event' })
    })
    expect(status.response.ok, 'change user status').toBe(true)

    const audit = await apiJson<{ items?: Array<{ id: string }> }>(`/users/${userId}/audit-events?page=1&limit=6`)
    const history = await apiJson<{ items?: Array<{ id: string, entity_display_name?: string | null, entity_id: string }> }>(
      `/users/${userId}/membership-history?page=1&limit=6`
    )
    expect(audit.response.ok, 'user audit endpoint').toBe(true)
    expect(history.response.ok, 'membership history endpoint').toBe(true)
    expect(audit.data.items?.length ?? 0, 'audit items').toBeGreaterThan(0)
    expect(history.data.items?.length ?? 0, 'membership history items').toBeGreaterThan(0)

    const [auditResponse, historyResponse] = await Promise.all([
      page.waitForResponse(response => response.url().includes(`/users/${userId}/audit-events`) && response.ok()),
      page.waitForResponse(response => response.url().includes(`/users/${userId}/membership-history`) && response.ok()),
      page.goto(`/app/users/${userId}?tab=history`)
    ])
    expect(auditResponse.status()).toBe(200)
    expect(historyResponse.status()).toBe(200)

    await expect(page.getByRole('heading', { name: 'Audit timeline' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Membership history' })).toBeVisible()
    await expect(page.getByText(history.data.items![0]!.entity_display_name ?? history.data.items![0]!.entity_id).first()).toBeVisible()

    // F-172: who made each change. The admin persona made both: the history names them "You",
    // linked to their own record, never a raw id.
    const event = page.getByTestId('membership-history-event').first()
    await expect(event.getByRole('link', { name: 'You' })).toBeVisible()
    await expect(page.getByRole('article').first().getByRole('link', { name: 'You', exact: true })).toBeVisible()
  })
})
