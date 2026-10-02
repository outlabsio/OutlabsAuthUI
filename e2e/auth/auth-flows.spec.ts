import { authMethodOn, expect, test } from '../support/fixtures'
import { mockPasswordOnlyConfig } from '../support/sign-in'
import { withExtraSurfaces, withoutSurfaces } from '../support/capabilities'

// Passwordless / recovery / invite flows + the F0 authUi config gates. Render + validation
// run without a backend (guest project); capability-dependent assertions self-skip.
test.describe('auth flows', () => {
  test('the retired forgot-password page lands on recovery, keeping ?redirect', async ({ page }) => {
    await page.goto('/auth/forgot-password?redirect=/app/users')
    await expect(page).toHaveURL(/\/auth\/recovery\?redirect=%2Fapp%2Fusers|\/auth\/recovery\?redirect=\/app\/users/)
    await expect(page.getByRole('heading', { name: 'Can\'t sign in?' })).toBeVisible()
  })

  test('guest pages have one main landmark, the same as the console\'s', async ({ page }) => {
    for (const path of ['/auth/login', '/auth/recovery', '/auth/reset-password']) {
      await page.goto(path)
      await expect(page.getByRole('heading').first()).toBeVisible()
      await expect(page.getByRole('main'), path).toHaveCount(1)
      await expect(page.getByRole('main'), path).toHaveAttribute('id', 'main-content')
    }
  })

  test('reset-password without a token shows an invalid-link message', async ({ page }) => {
    await page.goto('/auth/reset-password')
    await expect(page.getByRole('heading', { name: 'Invalid reset link' })).toBeVisible()
  })

  test('reset-password with a token shows the set-password form + validates match', async ({ page }) => {
    await page.goto('/auth/reset-password?token=demo-token')
    await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
    // The policy is stated up front and checked before any request.
    await expect(page.getByText(/At least 8 characters, with an uppercase/)).toBeVisible()
    await page.getByLabel('New password', { exact: true }).fill('longenough1')
    await page.getByRole('button', { name: 'Reset password' }).click()
    await expect(page.getByText('Add an uppercase letter.')).toBeVisible()
    await page.getByLabel('New password', { exact: true }).fill('Longenough1!')
    await page.getByLabel('Confirm new password').fill('Mismatch1!')
    await page.getByRole('button', { name: 'Reset password' }).click()
    await expect(page.getByText('Passwords must match.')).toBeVisible()
  })

  test('accept-invite without a token shows an invalid-link message', async ({ page }) => {
    await page.goto('/auth/accept-invite')
    await expect(page.getByRole('heading', { name: 'Invalid invitation link' })).toBeVisible()
  })

  test('accept-invite with a token shows the set-password form', async ({ page }) => {
    await page.goto('/auth/accept-invite?token=demo-token')
    await expect(page.getByRole('heading', { name: 'Accept your invitation' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Accept and sign in' })).toBeVisible()
  })

  // Where a password is chosen it can be checked before it is sent, as on sign-in, and a link
  // opened by mistake has a way back to sign-in (v-auth-shell-09).
  for (const { path, heading, fields } of [
    { path: '/auth/reset-password?token=demo-token&redirect=/app/users', heading: 'Choose a new password', fields: ['New password', 'Confirm new password'] },
    { path: '/auth/accept-invite?token=demo-token&redirect=/app/users', heading: 'Accept your invitation', fields: ['Password', 'Confirm password'] },
    { path: '/auth/signup?redirect=/app/users', heading: 'Create your account', fields: ['Password', 'Confirm password'] }
  ]) {
    test(`${path.split('?')[0]}: every password field can be revealed`, async ({ page }) => {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading })).toBeVisible()
      for (const label of fields) {
        const input = page.getByLabel(label, { exact: true })
        await input.fill('Secret-pass1!')
        await expect(input).toHaveAttribute('type', 'password')
        // The toggle sits inside the field, next to its input.
        const toggle = input.locator('xpath=..').getByRole('button', { name: 'Show password' })
        await toggle.click()
        await expect(input).toHaveAttribute('type', 'text')
        await expect(input.locator('xpath=..').getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
      }
      if (!path.startsWith('/auth/signup')) {
        const back = page.getByRole('link', { name: 'Back to sign in' })
        await expect(back).toHaveAttribute('href', /^\/auth\/login\?redirect=(%2F|\/)app(%2F|\/)users$/)
        await back.click()
        await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
      }
    })
  }

  test('guest pages speak to the person signing in, not to the operator', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await expect(page.getByText(/configured auth backend|admin console/i)).toHaveCount(0)
  })

  // ── F1: retired standalone pages fold into the unified flow ──

  test('magic-link without a token redirects into the unified sign-in', async ({ page }) => {
    await page.goto('/auth/magic-link')
    await expect(page).toHaveURL(/\/auth\/login/)
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  })

  test('access-code is an "Enter a sign-in code" page', async ({ page }) => {
    await page.goto('/auth/access-code')
    await expect(page).toHaveURL(/\/auth\/access-code/)
    await expect(page.getByRole('heading', { name: 'Enter a sign-in code' })).toBeVisible()
  })

  // ── Method surfacing (capability × config) ──

  test('the email form surfaces the passwordless alternates the backend exposes', async ({ page }) => {
    test.skip(!(await authMethodOn('magic_link')) || !(await authMethodOn('access_code')), 'Needs a backend with magic links + access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Email me a magic link instead' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a code instead' })).toBeVisible()
  })

  test('phone identifier reaches the channel step with the configured channels', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await page.getByLabel('Phone number').fill('+5491155551234')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Get your code' })).toBeVisible()
    await expect(page.getByText('We\'ll send a one-time code to +5491155551234.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send code via WhatsApp' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Send it by SMS instead' })).toBeVisible()
  })

  test('national phone number composes with the selected dial code', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await page.getByLabel('Phone number').fill('911 5555 1234')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByText('We\'ll send a one-time code to +5491155551234.')).toBeVisible()
  })

  test('Argentine mobile number without the 9 is accepted and canonicalized', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await page.getByLabel('Phone number').fill('1155551234')
    await expect(page.getByLabel('Phone number')).toHaveValue('11 5555-1234')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByText('We\'ll send a one-time code to +5491155551234.')).toBeVisible()
  })

  test('Argentine international mobile number without the 9 is canonicalized', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await page.getByLabel('Phone number').fill('+541155551234')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByText('We\'ll send a one-time code to +5491155551234.')).toBeVisible()
  })

  test('formats the Argentine mobile pattern without dropping the final digits', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()

    const phone = page.getByRole('textbox', { name: 'Phone number' })
    await phone.fill('91155551234')
    await expect(phone).toHaveValue('911 5555 1234')
  })

  test('country selector exposes the complete searchable territory list', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await page.getByRole('button', { name: 'Country code' }).click()
    await expect(page.getByRole('option', { name: /Canada/ })).toBeVisible()
    await expect(page.getByRole('option')).toHaveCount(245)
    await page.getByRole('option', { name: /Canada/ }).click()
    await expect(page.getByText('Phone number is required.')).toHaveCount(0)
  })

  test('phone input remains usable on a mobile viewport', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await expect(page.getByLabel('Country code')).toBeVisible()
    await expect(page.getByLabel('Phone number')).toBeVisible()
    await page.getByRole('button', { name: 'Country code' }).click()
    await expect(page.getByRole('option', { name: /United States/ })).toBeVisible()
    await expect(page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).resolves.toBe(true)
  })

  test('the phone number field asks for the phone keypad and phone autofill', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    const phone = page.getByLabel('Phone number')
    await expect(phone).toHaveAttribute('type', 'tel')
    await expect(phone).toHaveAttribute('inputmode', 'tel')
    await expect(phone).toHaveAttribute('autocomplete', 'tel-national')
  })

  test('the phone panel rejects an email', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await page.getByLabel('Phone number').fill('routed@example.com')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByText('Enter a valid phone number.')).toBeVisible()
  })

  test('no phone method button when the backend lacks access codes', async ({ page }) => {
    // Password-only capabilities (mocked — deterministic no matter which backend the dev
    // server can reach): the phone method disappears and the email form renders directly.
    await mockPasswordOnlyConfig(page)
    await page.goto('/auth/login')
    await expect(page.getByRole('button', { name: 'Continue with phone' })).toHaveCount(0)
    // Email-only: the form renders directly instead.
    await expect(page.getByLabel('Password', { exact: true })).toBeVisible()
  })

  // ── F0 config gates ──

  test('identifier email-only mode hides the dial-code picker and the phone method', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { identifier: 'email-only' }
      }
    })
    await page.goto('/auth/login')
    await expect(page.getByRole('button', { name: 'Continue with phone' })).toHaveCount(0)
    await expect(page.getByLabel('Country code')).toHaveCount(0)
  })

  test('magicLink: false hides the magic-link alternate but keeps the code alternate', async ({ page }) => {
    test.skip(!(await authMethodOn('magic_link')) || !(await authMethodOn('access_code')), 'Needs a backend with magic links + access codes on.')
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { magicLink: false }
      }
    })
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with email', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Email me a code instead' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a magic link instead' })).toHaveCount(0)
  })

  test('channels config controls which phone channels are offered', async ({ page }) => {
    test.skip(!(await authMethodOn('access_code')), 'Needs a backend with access codes on.')
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { channels: ['sms'] }
      }
    })
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await page.getByLabel('Phone number').fill('+5491155551234')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('button', { name: 'Send code via SMS' })).toBeVisible()
    await expect(page.getByRole('button', { name: /WhatsApp/ })).toHaveCount(0)
  })

  // ── OAuth ──

  // OAuth buttons need BOTH the deployment's provider list and the backend's oauth router
  // (mounted_surfaces). Neither example backend mounts it, so these specs add the surface.
  test('login shows OAuth buttons for deployment-configured providers (flat key)', async ({ page }) => {
    await withExtraSurfaces(page, ['oauth'])
    // Backwards-compat: the deprecated flat oauthProviders key still feeds the buttons.
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        oauthProviders: ['google']
      }
    })
    await page.goto('/auth/login')
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with email', exact: true })).toBeVisible()
  })

  test('login shows OAuth buttons declared via authUi.oauthProviders', async ({ page }) => {
    await withExtraSurfaces(page, ['oauth'])
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { oauthProviders: ['github'] }
      }
    })
    await page.goto('/auth/login')
    // Brand spelling, not naive capitalization.
    await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
  })

  test('login hides configured OAuth providers when the backend does not mount the oauth router', async ({ page }) => {
    await withoutSurfaces(page, ['oauth'])
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { oauthProviders: ['google'] }
      }
    })
    await page.goto('/auth/login')
    // The sign-in surface settles (email form or method buttons) without a Google button.
    await expect(page.getByLabel('Email').or(page.getByRole('button', { name: 'Continue with email', exact: true })).first()).toBeVisible()
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toHaveCount(0)
  })

  test('login surfaces an oauth_error returned by the provider callback', async ({ page }) => {
    await page.goto('/auth/login?oauth_error=unknown_account')
    await expect(page.getByText(/linked to an invitation/)).toBeVisible()
  })
})
