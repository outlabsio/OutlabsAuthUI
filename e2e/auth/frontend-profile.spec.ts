import { backendCapabilities, backendConfigured, expect, harnessAppConfig, persona, test } from '../support/fixtures'
import { openEmailForm } from '../support/sign-in'

// A console whose frontendProfileKey the backend does not register cannot sign anyone in
// (403 wrong_application). The sign-in page must say so inline and name the configured key,
// once: the inline alert replaces the generic "Sign in failed" toast.
const unregisteredKey = 'e2e-unregistered-profile'

// Whether a backend enforces frontend profiles is a deployment fact /auth/config does not
// publish. E2E_FRONTEND_PROFILES=enforced|none states it; otherwise the preset decides: the
// seeded EnterpriseRBAC example registers profiles (so an unknown key MUST be refused) and
// the SimpleRBAC example registers none (any key signs in, so there is nothing to test).
async function profilesEnforced(): Promise<boolean> {
  const declared = process.env.E2E_FRONTEND_PROFILES
  if (declared === 'enforced') return true
  if (declared === 'none') return false
  const config = await backendCapabilities() as { preset?: string } | null
  return config?.preset === 'EnterpriseRBAC'
}

test.describe('frontend profile key', () => {
  test.skip(!backendConfigured, 'Needs a seeded outlabsAuth backend (E2E_API_BASE_URL).')

  test('an unregistered frontendProfileKey is explained inline on sign-in', async ({ page, errorGuard }) => {
    // The backend refuses the unregistered profile key: the refusal under test.
    errorGuard.allow({ status: 403, url: /\/auth\/login$/ })
    // Decided before signing in, so a backend that wrongly accepts the key fails the test
    // instead of skipping it (and no login attempt is spent where there is nothing to check).
    test.skip(!(await profilesEnforced()), 'This backend registers no frontend profiles (set E2E_FRONTEND_PROFILES=enforced if it does).')

    // Registered after the fixture's route, so it wins for this test.
    await page.route('**/app-config.json', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...harnessAppConfig, frontendProfileKey: unregisteredKey })
    }))
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByLabel('Email').fill(persona('admin').email)
    await page.getByLabel('Password', { exact: true }).fill(persona('admin').password)
    await page.getByRole('button', { name: 'Sign in' }).click()

    await expect(page.getByText('This console cannot sign you in')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText(`the console's frontend profile "${unregisteredKey}"`)).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/login/)
    // One message, not two: the generic failure toast is suppressed for this error.
    await expect(page.getByText('Sign in failed')).toHaveCount(0)
  })
})
