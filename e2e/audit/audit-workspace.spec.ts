import { expect, test } from '../support/auth-fixture'
import {
  authPersonas,
  buildE2eAuthApiUrl,
} from '../support/auth-personas'

async function getAdminUserId() {
  const loginResponse = await fetch(buildE2eAuthApiUrl('/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: authPersonas.admin.email,
      password: authPersonas.admin.password,
    }),
  })

  if (!loginResponse.ok) {
    throw new Error(`Unable to authenticate admin for audit filters: ${loginResponse.status}`)
  }

  const tokens = (await loginResponse.json()) as { access_token: string }
  const meResponse = await fetch(buildE2eAuthApiUrl('/users/me'), {
    headers: {
      Authorization: `Bearer ${tokens.access_token}`,
    },
  })

  if (!meResponse.ok) {
    throw new Error(`Unable to load admin profile for audit filters: ${meResponse.status}`)
  }

  const me = (await meResponse.json()) as { id: string }
  return me.id
}

test.describe('Audit Workspace', () => {
  test('admin can open audit search workspace', async ({ page }) => {
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
      (request) =>
        request.url().includes('/audit-events') &&
        request.url().includes(`actor_user_id=${adminUserId}`)
    )

    await page.locator('#audit-actor-user-id').fill(adminUserId)
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await auditRequest

    await expect(page.getByText(/\d+ events/)).toBeVisible()
    await expect(page.locator('#audit-actor-user-id')).toHaveValue(adminUserId)

    await page.getByRole('button', { name: 'Reset' }).click()
    await expect(page.locator('#audit-actor-user-id')).toHaveValue('')
    await expect(page.locator('#audit-entity-id')).toHaveValue('')
    await expect(page.getByText('Pick a start date')).toBeVisible()
    await expect(page.getByText('Pick an end date')).toBeVisible()
    // Unfiltered page-1 query is often already cached; assert the workspace stays usable.
    await expect(page.getByText(/\d+ events|No audit events/)).toBeVisible()
  })

  test('admin can apply a date-range filter without crashing', async ({ page }) => {
    const fromValue = '2020-01-01T00:00'
    const toValue = '2099-12-31T23:45'

    const auditRequest = page.waitForRequest((request) => {
      if (!request.url().includes('/audit-events')) {
        return false
      }

      const url = new URL(request.url())
      return (
        url.searchParams.has('occurred_from') &&
        url.searchParams.has('occurred_to')
      )
    })

    await page.goto(
      `/app/audit?occurredFrom=${encodeURIComponent(fromValue)}&occurredTo=${encodeURIComponent(toValue)}`
    )
    await auditRequest
    await expect(page.getByText(/\d+ events/)).toBeVisible()
  })

  test('audit deep-link prefills entity filter from search params', async ({ page }) => {
    const entityId = '11111111-1111-4111-8111-111111111111'
    await page.goto(`/app/audit?entityId=${entityId}`)
    await expect(page.locator('#audit-entity-id')).toHaveValue(entityId)
    await expect(page.getByText(/\d+ events/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'No audit events' })).toBeVisible()
  })

  test('audit deep-link prefills subject filter from search params', async ({ page }) => {
    const subjectUserId = '22222222-2222-4222-8222-222222222222'
    await page.goto(`/app/audit?subjectUserId=${subjectUserId}`)
    await expect(page.locator('#audit-subject-user-id')).toHaveValue(subjectUserId)
    await expect(page.getByText(/\d+ events/)).toBeVisible()
  })

  test('audit deep-link prefills actor filter from search params', async ({ page }) => {
    const actorUserId = '33333333-3333-4333-8333-333333333333'
    await page.goto(`/app/audit?actorUserId=${actorUserId}`)
    await expect(page.locator('#audit-actor-user-id')).toHaveValue(actorUserId)
    await expect(page.getByText(/\d+ events/)).toBeVisible()
  })

  test('admin can filter Audit by clicking an actor id on an event card', async ({
    page,
  }) => {
    await page.goto('/app/audit')
    await expect(page.getByText(/\d+ events/)).toBeVisible()

    const actorButton = page
      .locator('button')
      .filter({ hasText: /^[0-9a-f-]{36}$/i })
      .first()
    await expect(actorButton).toBeVisible()
    const actorUserId = (await actorButton.innerText()).trim()

    await actorButton.click()
    await expect(page).toHaveURL(new RegExp(`actorUserId=${actorUserId}`))
    await expect(page.locator('#audit-actor-user-id')).toHaveValue(actorUserId)
  })

  test('admin can expand audit event details when payload is present', async ({
    page,
  }) => {
    await page.goto('/app/audit')
    await expect(page.getByText(/\d+ events/)).toBeVisible()

    const detailsTrigger = page
      .getByRole('button', { name: /Show details for /i })
      .first()
    await expect(detailsTrigger).toBeVisible()
    await detailsTrigger.click()

    await expect(
      page.getByRole('button', { name: /Hide details for /i }).first()
    ).toBeVisible()
    await expect(
      page
        .locator('pre')
        .or(page.getByText('Source', { exact: true }))
        .or(page.getByText('After', { exact: true }))
        .first()
    ).toBeVisible()
  })

  test('unknown actor filter yields empty state', async ({ page }) => {
    await page.goto('/app/audit')

    const unknownActorId = '00000000-0000-4000-8000-000000000099'
    const auditRequest = page.waitForRequest(
      (request) =>
        request.url().includes('/audit-events') &&
        request.url().includes(`actor_user_id=${unknownActorId}`)
    )

    await page.locator('#audit-actor-user-id').fill(unknownActorId)
    await page.getByRole('button', { name: 'Apply filters' }).click()
    await auditRequest

    await expect(page.getByText('No audit events')).toBeVisible()
    await expect(
      page.getByText('No events match the current filters.')
    ).toBeVisible()
  })
})
