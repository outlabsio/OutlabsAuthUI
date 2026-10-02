import { backendConfigured, expect, test } from '../support/fixtures'
import { adminAccessToken } from '../support/admin-token'

// Entity activity is the global audit search filtered by entity_id. Seed the live API with a
// fresh root + membership so the assertion never relies on ambient seed-log history. The cleanup
// project removes all pw- prefixed entities and users after the run.
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

type AuthConfigResponse = {
  features?: { activity_tracking?: boolean, entity_hierarchy?: boolean }
  mounted_surfaces?: string[]
}
type AuditEvent = {
  id: string
  entity_id?: string | null
  event_type: string
  event_source: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<{ response: Response, data: T }> {
  const response = await fetch(`${apiBaseUrl}${authApiPrefix}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${adminAccessToken()}`, ...init?.headers }
  })
  return { response, data: await response.json() as T }
}

test.describe('entity activity', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('renders a seeded, entity-filtered audit event and lets an admin inspect it', async ({ page, testData }) => {
    const configResponse = await fetch(`${apiBaseUrl}${authApiPrefix}/auth/config`)
    const config = configResponse.ok ? await configResponse.json() as AuthConfigResponse : null
    test.skip(!config?.features?.activity_tracking || !config.features.entity_hierarchy,
      'Needs activity_tracking and entity_hierarchy capabilities.')
    test.skip(Array.isArray(config?.mounted_surfaces) && !config?.mounted_surfaces.includes('audit'),
      'The backend does not mount the audit search surface.')

    const slug = testData.name('entity-activity')
    const entity = await apiJson<{ id?: string, display_name?: string }>('/entities/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: slug,
        display_name: testData.displayName('entity-activity'),
        slug,
        entity_class: 'structural',
        entity_type: 'organization'
      })
    })
    expect(entity.response.ok, 'create disposable entity').toBe(true)
    const entityId = entity.data.id ?? ''
    expect(entityId, 'created entity id').toBeTruthy()

    const user = await apiJson<{ id?: string }>('/users/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testData.email('entity-activity'),
        password: 'Testpass1!',
        root_entity_id: entityId
      })
    })
    expect(user.response.ok, 'create disposable user').toBe(true)
    const userId = user.data.id ?? ''
    expect(userId, 'created user id').toBeTruthy()

    // Membership lifecycle events are explicitly recorded with entity_id, before/after, and
    // metadata by outlabsAuth's membership service, making them a stable audit seed.
    const membership = await apiJson('/memberships/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        entity_id: entityId,
        role_ids: [],
        status: 'active',
        reason: 'E2E entity activity seed'
      })
    })
    expect(membership.response.ok, 'create entity membership').toBe(true)

    // Contract check before the browser: successful, non-empty, and strictly tied to this entity.
    const audit = await apiJson<{ items?: AuditEvent[] }>(`/audit-events?entity_id=${encodeURIComponent(entityId)}&page=1&limit=10`)
    expect(audit.response.ok, 'filtered audit endpoint').toBe(true)
    const events = audit.data.items ?? []
    expect(events.length, 'seeded filtered audit events').toBeGreaterThan(0)
    expect(events.every(event => event.entity_id === entityId), 'all returned events match entity filter').toBe(true)
    const seededEvent = events.find(event => event.before || event.after || event.metadata)
    expect(seededEvent, 'an inspectable seeded event').toBeTruthy()

    const auditResponse = page.waitForResponse(async (response) => {
      if (!response.ok() || !response.url().includes('/audit-events')) return false
      const url = new URL(response.url())
      return url.searchParams.get('entity_id') === entityId
    })
    await page.goto(`/app/entities?entity=${entityId}`)
    const browserAuditResponse = await auditResponse
    const browserAudit = await browserAuditResponse.json() as { items?: AuditEvent[] }
    expect((browserAudit.items ?? []).every(event => event.entity_id === entityId), 'browser request remains entity-filtered').toBe(true)

    await expect(page.getByRole('heading', { name: 'Activity', exact: true })).toBeVisible()
    await expect(page.getByText(events.length === 1 ? '1 event' : `${events.length} events`, { exact: true })).toBeVisible()
    // Each event is an article titled by its humanized type (F-091/F-220); the raw type, its
    // source and the payload are in the disclosure.
    const event = page.getByRole('article').first()
    await expect(event.getByRole('heading', { level: 3 })).toBeVisible()
    const details = event.getByRole('button', { name: 'Show details' })
    await expect(details).toHaveAttribute('aria-expanded', 'false')
    await details.click()
    await expect(event.getByRole('button', { name: 'Hide details' })).toHaveAttribute('aria-expanded', 'true')
    await expect(event.getByText(seededEvent!.event_type, { exact: true })).toBeVisible()
    await expect(event.getByText(seededEvent!.event_source, { exact: true })).toBeVisible()
    await event.getByRole('button', { name: 'Show raw payload' }).click()
    await expect(event.getByRole('heading', { name: 'After', exact: true })).toBeVisible()
    await expect(event.getByRole('heading', { name: 'Metadata', exact: true })).toBeVisible()
    // F-189: pivots are links into the filtered Audit workspace.
    await expect(event.getByRole('link', { name: `Events at ${entity.data.display_name}` })).toHaveAttribute('href', `/app/audit?entityId=${entityId}`)
    // Nuxt UI renders `to` buttons as links, so assert the actual semantic role.
    await expect(page.getByRole('link', { name: 'Open in Audit' })).toBeVisible()
  })
})
