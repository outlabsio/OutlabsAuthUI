import { expect, test } from '../support/fixtures'
import { signInWithPassword } from '../support/sign-in'

// Seeded account states at sign-in (F-037 guest states, F-147). The EnterpriseRBAC seed has a
// suspended operator and a temporarily locked user, both with the seed password. Each test is
// one refused password attempt (counted by the backend's login limiter; neither signs in).
test.use({ errorGuardMode: 'strict' })

const SEED_PASSWORD = 'Testpass1!'

test.describe('seeded account states at sign-in (EnterpriseRBAC)', () => {
  test.beforeEach(async ({ requires }) => {
    await requires({ preset: 'EnterpriseRBAC', authMethods: ['password'] })
  })

  test('a suspended account is told it is suspended and stays on the sign-in page', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 401, url: /\/auth\/login$/ })
    await signInWithPassword(page, 'suspended@ny.acme.com', SEED_PASSWORD)
    await expect(page.getByText('Sign in failed', { exact: true })).toBeVisible()
    await expect(page.getByText(/suspended/i).first()).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('a locked account gets the generic refusal, which never confirms the account exists', async ({ page, errorGuard }) => {
    // outlabs-auth answers a locked account's correct password with INVALID_CREDENTIALS.
    errorGuard.allow({ status: 401, url: /\/auth\/login$/ })
    await signInWithPassword(page, 'locked@la.acme.com', SEED_PASSWORD)
    await expect(page.getByText('Sign in failed', { exact: true })).toBeVisible()
    await expect(page.getByText(/locked/i)).toHaveCount(0)
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
