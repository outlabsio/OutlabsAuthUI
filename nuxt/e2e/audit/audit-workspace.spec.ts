import { backendConfigured, expect, test } from '../support/fixtures'
import { apiLogin } from '../support/passwordless-capture'

// Audit workspace (chromium project, admin storageState — admin is superuser, so user:read
// passes). Ported from the React audit-workspace suite; selectors adapt to the Nuxt DOM but
// the behaviors are identical: filter-to-URL, deep-link prefill, click-to-filter, expandable
// payloads, and empty states.
const adminEmail = process.env.E2E_ADMIN_EMAIL ?? 'admin@acme.com'
const adminPassword = process.env.E2E_ADMIN_PASSWORD ?? 'Testpass1!'
const apiBaseUrl = process.env.E2E_API_BASE_URL ?? 'http://localhost:8004'
const authApiPrefix = process.env.E2E_AUTH_API_PREFIX ?? '/v1'

async function getAdminUserId() {
  const token = await apiLogin(adminEmail, adminPassword)
  const res = await fetch(`${apiBaseUrl}${authApiPrefix}/users/me`, {
    headers: { Authorization: `Bearer ${token}` }
  })
  if (!res.ok) throw new Error(`Unable to load admin profile for audit filters: ${res.status}`)
  return ((await res.json()) as { id: string }).id
}

test.describe('audit workspace', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('admin can open the audit search workspace', async ({ page }) => {
    await page.goto('/app/audit')
    await expect(page).toHaveURL(/\/app\/audit(?:\?.*)?$/)
    await expect(page.getByRole('button', { name: 'Open Audit guide' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible()
    await expect(page.locator('#audit-actor-user-id')).toBeVisible()
    await expect(page.locator('#audit-entity-id')).toBeVisible()
    await expect(page.locator('#audit-occurred-from')).toBeVisible()
    await expect(page.locator('#audit-occurred-to')).toBeVisible()
  })

  test('admin can filter by actor and clear with reset', async ({ page }) => {
    const adminUserId = await getAdminUserId()

    await page.goto('/app/audit')
    await expect(page.getByText(/\d+ events/)).toBeVisible()

    const auditRequest = page.waitForRequest(
      request => request.url().includes('/audit-events') && request.url().includes(`actor_user_id=${adminUserId}`)
    )
    await page.locator('#audit-actor-user-id').fill(adminUserId)
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await auditRequest

    await expect(page.getByText(/\d+ events/)).toBeVisible()
    await expect(page.locator('#audit-actor-user-id')).toHaveValue(adminUserId)

    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(page.locator('#audit-actor-user-id')).toHaveValue('')
    await expect(page.locator('#audit-entity-id')).toHaveValue('')
    // Native datetime inputs clear on reset (the React app used a picker showing placeholder text).
    await expect(page.locator('#audit-occurred-from')).toHaveValue('')
    await expect(page.locator('#audit-occurred-to')).toHaveValue('')
    await expect(page.getByText(/\d+ events|No audit events/)).toBeVisible()
  })

  test('admin can apply a date-range filter without crashing', async ({ page }) => {
    const auditRequest = page.waitForRequest((request) => {
      if (!request.url().includes('/audit-events')) return false
      const url = new URL(request.url())
      return url.searchParams.has('occurred_from') && url.searchParams.has('occurred_to')
    })

    await page.goto(
      `/app/audit?occurredFrom=${encodeURIComponent('2020-01-01T00:00')}&occurredTo=${encodeURIComponent('2099-12-31T23:45')}`
    )
    await auditRequest
    await expect(page.getByText(/\d+ events/)).toBeVisible()
  })

  test('deep-link prefills the entity filter and shows the empty state', async ({ page }) => {
    const entityId = '11111111-1111-4111-8111-111111111111'
    await page.goto(`/app/audit?entityId=${entityId}`)
    await expect(page.locator('#audit-entity-id')).toHaveValue(entityId)
    await expect(page.getByText(/\d+ events/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No audit events' })).toBeVisible()
  })

  test('deep-link prefills the subject filter', async ({ page }) => {
    const subjectUserId = '22222222-2222-4222-8222-222222222222'
    await page.goto(`/app/audit?subjectUserId=${subjectUserId}`)
    await expect(page.locator('#audit-subject-user-id')).toHaveValue(subjectUserId)
    await expect(page.getByText(/\d+ events/)).toBeVisible()
  })

  test('deep-link prefills the actor filter', async ({ page }) => {
    const actorUserId = '33333333-3333-4333-8333-333333333333'
    await page.goto(`/app/audit?actorUserId=${actorUserId}`)
    await expect(page.locator('#audit-actor-user-id')).toHaveValue(actorUserId)
    await expect(page.getByText(/\d+ events/)).toBeVisible()
  })

  test('clicking an actor id on an event card filters by it', async ({ page }) => {
    await page.goto('/app/audit')
    await expect(page.getByText(/\d+ events/)).toBeVisible()

    const actorButton = page.locator('button[aria-label^="Filter by actor "]').first()
    await expect(actorButton).toBeVisible()
    const actorUserId = (await actorButton.innerText()).trim()

    await actorButton.click()
    await expect(page).toHaveURL(new RegExp(`actorUserId=${actorUserId}`))
    await expect(page.locator('#audit-actor-user-id')).toHaveValue(actorUserId)
  })

  test('admin can expand an event to inspect its payload', async ({ page }) => {
    await page.goto('/app/audit')
    await expect(page.getByText(/\d+ events/)).toBeVisible()

    const detailsTrigger = page.getByRole('button', { name: /Show details for /i }).first()
    await expect(detailsTrigger).toBeVisible()
    await detailsTrigger.click()

    await expect(page.getByRole('button', { name: /Hide details for /i }).first()).toBeVisible()
    await expect(
      page.locator('pre').or(page.getByText('Source', { exact: true })).or(page.getByText('After', { exact: true })).first()
    ).toBeVisible()
  })

  test('an unknown actor filter yields the empty state', async ({ page }) => {
    await page.goto('/app/audit')
    await expect(page.getByText(/\d+ events/)).toBeVisible()

    const unknownActorId = '00000000-0000-4000-8000-000000000099'
    const auditRequest = page.waitForRequest(
      request => request.url().includes('/audit-events') && request.url().includes(`actor_user_id=${unknownActorId}`)
    )
    await page.locator('#audit-actor-user-id').fill(unknownActorId)
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await auditRequest

    await expect(page.getByRole('heading', { name: 'No audit events' })).toBeVisible()
    await expect(page.getByText('No events match the current filters.')).toBeVisible()
  })
})
