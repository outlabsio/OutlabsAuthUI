import { expect, test } from '../support/auth-fixture'
import {
  authPersonas,
  buildE2eAuthApiUrl,
  e2eApiBaseURL,
} from '../support/auth-personas'

async function getAdminAccessToken() {
  const response = await fetch(buildE2eAuthApiUrl('/auth/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: authPersonas.admin.email,
      password: authPersonas.admin.password,
    }),
  })

  if (!response.ok) {
    throw new Error(`Unable to authenticate admin for pagination seed: ${response.status}`)
  }

  const payload = (await response.json()) as { access_token: string }
  return payload.access_token
}

async function getUsersTotal(accessToken: string) {
  const response = await fetch(`${e2eApiBaseURL}/v1/users/?page=1&limit=1`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  if (!response.ok) {
    throw new Error(`Unable to load users total: ${response.status}`)
  }

  const payload = (await response.json()) as { total: number }
  return payload.total
}

async function createUsersUntilSecondPage(accessToken: string, pageSize = 20) {
  const total = await getUsersTotal(accessToken)
  const needed = Math.max(0, pageSize + 1 - total)
  const stamp = Date.now()

  for (let index = 0; index < needed; index += 1) {
    const response = await fetch(`${e2eApiBaseURL}/v1/users/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        email: `playwright-page-${stamp}-${index}@example.com`,
        password: 'PlaywrightPass123!',
        first_name: 'Page',
        last_name: `User${index}`,
      }),
    })

    if (!response.ok) {
      throw new Error(`Unable to seed pagination user: ${response.status}`)
    }
  }
}

test.describe('Workspace pagination smoke', () => {
  test('admin can page Users list and sees pagination chrome in Audit', async ({
    page,
  }) => {
    const accessToken = await getAdminAccessToken()
    await createUsersUntilSecondPage(accessToken)

    await page.goto('/app/users')
    await expect(page.getByRole('button', { name: 'Open Users guide' })).toBeVisible()
    await expect(page.getByText(/Page 1 of \d+ with \d+ total users/)).toBeVisible()

    const nextUsers = page.getByRole('button', { name: 'Next' })
    await expect(nextUsers).toBeEnabled()
    await nextUsers.click()
    await expect(page.getByText(/Page 2 of \d+ with \d+ total users/)).toBeVisible()

    const previousUsers = page.getByRole('button', { name: 'Previous' })
    await expect(previousUsers).toBeEnabled()
    await previousUsers.click()
    await expect(page.getByText(/Page 1 of \d+ with \d+ total users/)).toBeVisible()

    await page.goto('/app/audit')
    await expect(page.getByRole('heading', { name: 'Audit', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Apply filters' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Previous' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible()

    await page.goto('/app/roles')
    await expect(page.getByRole('button', { name: 'Open Roles guide' })).toBeVisible()

    await page.goto('/app/permissions')
    await expect(
      page.getByRole('button', { name: 'Open Permissions guide' })
    ).toBeVisible()
  })
})
