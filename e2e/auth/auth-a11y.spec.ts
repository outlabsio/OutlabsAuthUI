import { expect, test } from '../support/fixtures'
import { expectAccessible } from '../support/a11y'
import { patchAuthConfig } from '../support/capabilities'

// The accessibility gate on guest pages (F-138), in light and dark at 1440 and 390px
// (support/a11y.ts). Pages that need a token get a made-up one: the gate covers the form or
// the invalid-link state they render. No backend needed.
test.use({ errorGuardMode: 'strict' })

const pages = [
  { path: '/auth/login', heading: 'Sign in' },
  { path: '/auth/recovery', heading: /Recover|Can't sign in|Trouble/i },
  { path: '/auth/access-code', heading: 'Enter a sign-in code' },
  { path: '/auth/reset-password', heading: /link/i },
  { path: '/auth/reset-password?token=e2e-a11y-token', heading: /password/i },
  { path: '/auth/accept-invite?token=e2e-a11y-token', heading: /password|invitation|Welcome/i },
  { path: '/auth/signup', heading: /Create|Sign up|account/i },
  { path: '/this-page-does-not-exist', heading: /404|not found/i }
]

for (const { path, heading } of pages) {
  test(`no a11y violations on ${path}`, async ({ page, errorGuard }) => {
    // The 404 page: Nuxt logs the unmatched route it renders.
    errorGuard.allow({ kind: 'console', console: /NUXT_E1005|Page not found/ })
    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading }).first()).toBeVisible()
    await expectAccessible(page)
  })
}

// Signup on a backend that takes no self-registration: the explanation in place of the form.
test('no a11y violations on /auth/signup where sign-up is by invitation', async ({ page }) => {
  await patchAuthConfig(page, config => ({ ...config, registration_mode: 'invite_only' }))
  await page.goto('/auth/signup')
  await expect(page.getByRole('heading', { name: 'Sign-up is by invitation' })).toBeVisible()
  await expectAccessible(page)
})
