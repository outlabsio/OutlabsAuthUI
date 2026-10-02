import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect, persona, personaState, test } from '../support/fixtures'
import { patchAuthConfig, type LiveAuthConfig } from '../support/capabilities'
import { apiUrl, appOrigin } from '../support/env'
import { corsHeaders, jsonResponse } from '../support/mocks'
import { markOAuthPending, openEmailForm, readOAuthPending } from '../support/sign-in'
import { mintFreshSession } from '../support/sessions'

// Guest-surface hardening (WP-10): layout of the passwordless alternates, request cooldowns and
// 429 handling, URL steps (Back/Forward, reload), focus on step change, per-code OAuth errors,
// the OAuth round trip keeping ?redirect, the back/forward-cache reset, and the dark-mode logo.
// Capabilities and the request endpoints are mocked, so these run on any backend preset; the
// real round trips with captured codes and links live in link-landings.spec.ts.

test.use({ errorGuardMode: 'strict' })

// Every sign-in method on, whatever the backend under test reports.
async function allMethods(page: Page) {
  await patchAuthConfig(page, config => ({
    ...config,
    features: { ...config.features, magic_links: true, access_codes: true },
    auth_methods: { password: true, magic_link: true, access_code: true }
  }) as LiveAuthConfig)
}

type Mocked = { status: number, body?: unknown }

// Answers POST <path> with `respond(n)` for the n-th call; returns a call counter.
async function mockPost(page: Page, path: string, respond: (call: number) => Mocked) {
  let calls = 0
  await page.route(apiUrl(path), async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: corsHeaders('POST,OPTIONS') })
    calls += 1
    const { status, body } = respond(calls)
    if (status === 204) return route.fulfill({ status: 204, headers: corsHeaders('POST,OPTIONS') })
    return route.fulfill(jsonResponse(status, body ?? {}, 'POST,OPTIONS'))
  })
  return () => calls
}

async function fillOtp(page: Page, code: string) {
  for (let i = 0; i < code.length; i++) {
    await page.getByRole('textbox', { name: `pin input ${i + 1} of ${code.length}` }).fill(code[i]!)
  }
}

test.describe('sign-in steps', () => {
  for (const width of [1440, 390]) {
    test(`the email alternates stack inside the card at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await allMethods(page)
      await page.goto('/auth/login')
      await openEmailForm(page)
      const link = page.getByRole('button', { name: 'Email me a magic link instead' })
      const code = page.getByRole('button', { name: 'Email me a code instead' })
      // Measure once the disclosure has finished opening (nothing clipped).
      await expect(code).toBeInViewport({ ratio: 1 })
      await expect(link).toBeInViewport({ ratio: 1 })

      const linkBox = (await link.boundingBox())!
      const codeBox = (await code.boundingBox())!
      // One per row, no overlap, and fully inside the viewport.
      expect(codeBox.y).toBeGreaterThanOrEqual(linkBox.y + linkBox.height)
      for (const box of [linkBox, codeBox]) {
        expect(box.x).toBeGreaterThanOrEqual(0)
        expect(box.x + box.width).toBeLessThanOrEqual(width)
      }
      // Neither label is clipped, and the page does not scroll sideways.
      for (const button of [link, code]) {
        expect(await button.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    })
  }

  test('the password can be revealed', async ({ page }) => {
    await page.goto('/auth/login')
    await openEmailForm(page)
    const password = page.getByLabel('Password', { exact: true })
    await expect(password).toHaveAttribute('type', 'password')
    await page.getByRole('button', { name: 'Show password' }).click()
    await expect(password).toHaveAttribute('type', 'text')
    await expect(page.getByRole('button', { name: 'Hide password' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('an alternate checks the email on its field before any request', async ({ page }) => {
    await allMethods(page)
    const calls = await mockPost(page, '/auth/magic-link/request', () => ({ status: 204 }))
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByRole('button', { name: 'Email me a magic link instead' }).click()
    await expect(page.getByText('Email is required.')).toBeVisible()
    // The password field is not flagged for a passwordless request.
    await expect(page.getByText('Password is required.')).toHaveCount(0)
    expect(calls()).toBe(0)
  })

  test('a sent code starts a resend cooldown that survives a reload and Back', async ({ page }) => {
    await allMethods(page)
    const calls = await mockPost(page, '/auth/access-code/request', () => ({ status: 204 }))
    const email = 'cooldown@example.com'
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Email me a code instead' }).click()

    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
    await expect(page.getByText(`If ${email} has an account here, we sent it a 6-digit code.`)).toBeVisible()
    await expect(page).toHaveURL(/[?&]step=code/)
    const resend = page.getByRole('button', { name: /^Resend code in \d+s$/ })
    await expect(resend).toBeDisabled()

    // A reload keeps the code step and its cooldown, without asking for another code.
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()
    await expect(page.getByText(`If ${email} has an account here, we sent it a 6-digit code.`)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Resend code in \d+s$/ })).toBeDisabled()
    expect(calls()).toBe(1)

    // Back returns to the methods; the same email's code request is still cooling down.
    await page.goBack()
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
    await openEmailForm(page)
    await page.getByLabel('Email').fill(email)
    await expect(page.getByRole('button', { name: /^Email me a code instead in \d+s$/ })).toBeDisabled()
  })

  test('a rate-limited request waits the seconds the API asked for (auth_only error shape)', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 429, url: /magic-link\/request/ })
    errorGuard.allow({ console: /status of 429/ })
    await allMethods(page)
    await mockPost(page, '/auth/magic-link/request', () => ({
      status: 429,
      body: { detail: { message: 'Too many magic link requests. Please try again later.', retry_after_seconds: 42 } }
    }))
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByLabel('Email').fill('limited@example.com')
    await page.getByRole('button', { name: 'Email me a magic link instead' }).click()

    await expect(page.getByText('Please wait a moment', { exact: true })).toBeVisible()
    await expect(page.getByText(/^Too many requests\. Try again in 4[0-2] seconds\.$/)).toBeVisible()
    await expect(page.getByRole('button', { name: /^Email me a magic link instead in 4[0-2]s$/ })).toBeDisabled()
  })

  test('a rate-limited verify is not called an invalid code', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 429, url: /access-code\/verify/ })
    errorGuard.allow({ console: /status of 429/ })
    await allMethods(page)
    await mockPost(page, '/auth/access-code/request', () => ({ status: 204 }))
    await mockPost(page, '/auth/access-code/verify', () => ({
      status: 429,
      body: { error: 'HTTP_ERROR', message: 'Too many access code verification attempts. Please try again later.', details: { retry_after_seconds: 30 } }
    }))
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByLabel('Email').fill('verify-limit@example.com')
    await page.getByRole('button', { name: 'Email me a code instead' }).click()
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()

    await fillOtp(page, '123456')
    await expect(page.getByText('Please wait a moment', { exact: true })).toBeVisible()
    await expect(page.getByText('Invalid code', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Verify and sign in in \d+s$/ })).toBeDisabled()
  })

  // The code is a form field: a code the server refuses is said on it, tied to it for assistive
  // technology, and stays there after the boxes clear for the next try, instead of passing in a
  // toast (c-guardrails-03).
  test('a wrong code is said on the code field and stays after the boxes clear', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 401, url: /access-code\/verify/ })
    errorGuard.allow({ console: /status of 401/ })
    await allMethods(page)
    await mockPost(page, '/auth/access-code/request', () => ({ status: 204 }))
    const verifies = await mockPost(page, '/auth/access-code/verify', () => ({
      status: 401,
      body: { error: 'TOKEN_INVALID', message: 'Invalid or expired access code' }
    }))
    await page.goto('/auth/login')
    await openEmailForm(page)
    await page.getByLabel('Email').fill('wrong-code@example.com')
    await page.getByRole('button', { name: 'Email me a code instead' }).click()
    await expect(page.getByRole('heading', { name: 'Enter your code' })).toBeVisible()

    await fillOtp(page, '123456')
    const message = 'This code is wrong or has expired. Check it and try again, or resend the code.'
    const fieldError = page.getByRole('alert').filter({ hasText: message })
    await expect(fieldError).toBeVisible()
    expect(verifies()).toBe(1)
    const code = page.locator('[aria-label="Access code"]')
    await expect(code).toHaveAttribute('aria-invalid', 'true')
    await expect(code).toHaveAttribute('aria-describedby', /-error$/)
    // Not a toast: nothing else repeats it.
    await expect(page.getByText('Invalid code', { exact: true })).toHaveCount(0)
    // The boxes are emptied and focused for the next try; the reason stays in view.
    const first = page.getByRole('textbox', { name: 'pin input 1 of 6' })
    await expect(first).toHaveValue('')
    await expect(first).toBeFocused()
    await first.fill('9')
    await expect(fieldError).toBeVisible()
    // The next attempt starts clean.
    await fillOtp(page, '654321')
    await expect.poll(verifies).toBe(2)
    await expect(fieldError).toBeVisible()
  })

  test('phone steps are in the history, and focus lands on each step', async ({ page }) => {
    await allMethods(page)
    await mockPost(page, '/auth/access-code/request', () => ({ status: 204 }))
    await page.goto('/auth/login')
    await page.getByRole('button', { name: 'Continue with phone' }).click()
    await page.getByLabel('Phone number').fill('+5491155551234')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()

    const channelHeading = page.getByRole('heading', { level: 1, name: 'Get your code' })
    await expect(channelHeading).toBeVisible()
    await expect(channelHeading).toBeFocused()

    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible()
    await page.goForward()
    await expect(channelHeading).toBeVisible()

    // The code step focuses the first digit (numeric keypad, one-time-code autofill).
    await page.getByRole('button', { name: 'Send code via WhatsApp' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Enter your code' })).toBeVisible()
    const firstDigit = page.getByRole('textbox', { name: 'pin input 1 of 6' })
    await expect(firstDigit).toBeFocused()
    await expect(firstDigit).toHaveAttribute('inputmode', 'numeric')
    await expect(firstDigit).toHaveAttribute('autocomplete', 'one-time-code')
  })

  test('the destination is carried to recovery, signup and the code page', async ({ page }) => {
    await allMethods(page)
    await page.goto('/auth/login?redirect=/app/users')
    for (const name of ['Can\'t sign in?', 'I already have a code', 'Create an account']) {
      await expect(page.getByRole('link', { name })).toHaveAttribute('href', /redirect=(%2F|\/)app(%2F|\/)users/)
    }
  })

  test('recovery has a heading and moves focus to the next step', async ({ page }) => {
    await mockPost(page, '/auth/forgot-password', () => ({ status: 204 }))
    await page.goto('/auth/recovery')
    await expect(page.getByRole('heading', { level: 1, name: 'Can\'t sign in?' })).toBeVisible()
    const emailChoice = page.getByRole('button', { name: 'Recover with email' })
    await expect(emailChoice.or(page.getByLabel('Email')).first()).toBeVisible()
    if (await emailChoice.count()) await emailChoice.click()
    await page.getByLabel('Email').fill('recover-focus@example.com')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    const sent = page.getByRole('heading', { level: 1, name: 'Check your email' })
    await expect(sent).toBeVisible()
    await expect(sent).toBeFocused()
    await expect(page.getByRole('button', { name: /^Send another link in \d+s$/ })).toBeDisabled()
  })

  test('recovery will not send a reset link again to an address that is cooling down', async ({ page }) => {
    const calls = await mockPost(page, '/auth/forgot-password', () => ({ status: 204 }))
    await page.goto('/auth/recovery')
    const emailChoice = page.getByRole('button', { name: 'Recover with email' })
    await expect(emailChoice.or(page.getByLabel('Email')).first()).toBeVisible()
    if (await emailChoice.count()) await emailChoice.click()
    await page.getByLabel('Email').fill('recover-wait@example.com')
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Check your email' })).toBeVisible()

    // Back to the form with the same address: the submit waits out the cooldown and says so.
    await page.goBack()
    await expect(page.getByRole('heading', { level: 1, name: 'Can\'t sign in?' })).toBeVisible()
    await expect(page.getByLabel('Email')).toHaveValue('recover-wait@example.com')
    await expect(page.getByRole('button', { name: /^Send reset link in \d+s$/ })).toBeDisabled()
    // Another address has no cooldown.
    await page.getByLabel('Email').fill('recover-other@example.com')
    await expect(page.getByRole('button', { name: 'Send reset link', exact: true })).toBeEnabled()
    expect(calls()).toBe(1)
  })

  test('each oauth_error code has its own dismissible explanation and leaves the URL', async ({ page }) => {
    const codes: Array<[string, string]> = [
      ['unknown_account', 'No account uses that sign-in'],
      ['account_exists', 'You already have an account'],
      ['inactive', 'This account cannot sign in yet'],
      ['invalid_state', 'The sign-in expired'],
      ['provider', 'The provider did not complete the sign-in'],
      ['wrong_application', 'This console cannot sign you in']
    ]
    for (const [code, title] of codes) {
      await page.goto(`/auth/login?oauth_error=${code}&redirect=/app/users`)
      const alert = page.getByRole('alert').filter({ hasText: title })
      await expect(alert).toBeVisible()
      // Removed from the URL (a retry or reload starts clean); the destination stays.
      await expect(page).toHaveURL(url => !url.searchParams.has('oauth_error') && url.searchParams.get('redirect') === '/app/users')
      await alert.getByRole('button', { name: 'Close' }).click()
      await expect(alert).toHaveCount(0)
    }
  })

  test('a provider sign-in comes back to ?redirect', async ({ page, api, requires }) => {
    // A fresh session minted by accepting an invite (no password login).
    await requires({ capture: ['invite'] })
    const { tokens } = await mintFreshSession(api, 'oauth-redirect')
    await patchAuthConfig(page, config => ({ ...config, mounted_surfaces: [...(config.mounted_surfaces ?? []), 'oauth'] }))
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { oauthProviders: ['google'] }
      }
    })
    // The "provider" sends the browser straight back to the callback with a session, as the
    // backend's OAuth callback does after a successful consent.
    const fragment = new URLSearchParams({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_type: 'bearer' })
    await page.route(/\/oauth\/google\/authorize/, route => route.fulfill(jsonResponse(200, {
      authorization_url: `${appOrigin}/auth/oauth/callback#${fragment}`
    }, 'GET,OPTIONS')))

    // The callback's fragment is not an anchor: nothing may echo it (tokens included) to the console.
    const consoleLines: string[] = []
    page.on('console', message => consoleLines.push(message.text()))

    await page.goto('/auth/login?redirect=/app/account')
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page).toHaveURL(url => url.pathname === '/app/account')
    expect(consoleLines.filter(line => line.includes(tokens.access_token))).toEqual([])
  })

  test('a provider sign-up comes back to ?redirect', async ({ page, api, requires }) => {
    // Signup starts the same provider hand-off, so it must leave the same callback marker.
    await requires({ capture: ['invite'] })
    const { tokens } = await mintFreshSession(api, 'oauth-signup')
    await patchAuthConfig(page, config => ({ ...config, mounted_surfaces: [...(config.mounted_surfaces ?? []), 'oauth'] }))
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { oauthProviders: ['google'] }
      }
    })
    const fragment = new URLSearchParams({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, token_type: 'bearer' })
    await page.route(/\/oauth\/google\/authorize/, route => route.fulfill(jsonResponse(200, {
      authorization_url: `${appOrigin}/auth/oauth/callback#${fragment}`
    }, 'GET,OPTIONS')))

    await page.goto('/auth/signup?redirect=/app/account')
    await page.getByRole('button', { name: 'Continue with Google' }).click()
    await expect(page).toHaveURL(url => url.pathname === '/app/account')
    expect(await readOAuthPending(page)).toBeNull()
  })

  test('a provider error ends the attempt, so a later callback in the tab is refused', async ({ page }) => {
    await page.goto('/auth/login')
    await markOAuthPending(page)
    await page.goto('/auth/login?oauth_error=provider')
    await expect(page.getByRole('alert').filter({ hasText: 'The provider did not complete the sign-in' })).toBeVisible()
    expect(await readOAuthPending(page)).toBeNull()
  })

  test('Back from the provider does not leave the button stuck loading', async ({ page }) => {
    await patchAuthConfig(page, config => ({ ...config, mounted_surfaces: [...(config.mounted_surfaces ?? []), 'oauth'] }))
    await page.addInitScript(() => {
      ;(window as unknown as { __OUTLABS_AUTH_UI_CONFIG__?: Record<string, unknown> }).__OUTLABS_AUTH_UI_CONFIG__ = {
        authUi: { oauthProviders: ['google'] }
      }
    })
    // A "provider" answering 204 keeps this document, like a page restored from the
    // back/forward cache after pressing Back at the consent screen.
    await page.route(`${appOrigin}/__e2e-provider`, route => route.fulfill({ status: 204 }))
    await page.route(/\/oauth\/google\/authorize/, route => route.fulfill(jsonResponse(200, {
      authorization_url: `${appOrigin}/__e2e-provider`
    }, 'GET,OPTIONS')))

    await page.goto('/auth/login')
    const google = page.getByRole('button', { name: 'Continue with Google' })
    await google.click()
    await expect(google).toBeDisabled()
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await expect(google).toBeEnabled()
  })

  test('phone recovery explains a wrong-application code inline, not as an invalid code', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 403, url: /access-code\/verify/ })
    errorGuard.allow({ console: /status of 403/ })
    await allMethods(page)
    await mockPost(page, '/auth/access-code/request', () => ({ status: 204 }))
    await mockPost(page, '/auth/access-code/verify', () => ({
      status: 403,
      body: { error: 'HTTP_ERROR', message: 'This account cannot sign in to this application.', details: { code: 'wrong_application' } }
    }))
    await page.goto('/auth/recovery')
    await page.getByRole('button', { name: 'Recover with phone' }).click()
    await page.getByLabel('Phone number').fill('+5491155551234')
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await page.getByRole('button', { name: 'Send code via WhatsApp' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Enter your code' })).toBeVisible()

    await fillOtp(page, '123456')
    await expect(page.getByRole('alert').filter({ hasText: 'This console cannot sign you in' })).toBeVisible()
    await expect(page.getByText('Invalid code', { exact: true })).toHaveCount(0)

    // Starting over clears it.
    await page.getByRole('button', { name: 'Use a different email or phone' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Can\'t sign in?' })).toBeVisible()
    await expect(page.getByRole('alert').filter({ hasText: 'This console cannot sign you in' })).toHaveCount(0)
  })

  test('a failed provider callback goes back to sign-in with the destination', async ({ page }) => {
    // The sign-in page parks ?redirect before leaving for the provider; the callback reads it.
    await page.addInitScript(() => window.sessionStorage.setItem('outlabs-auth.post-sign-in-redirect', '/app/users'))
    await page.goto('/auth/oauth/callback')
    await expect(page.getByRole('heading', { level: 1, name: 'Sign-in failed' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', /^\/auth\/login\?redirect=(%2F|\/)app(%2F|\/)users$/)
  })

  test('a failed magic link opens sign-in on the email form to request a new one', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 401, url: /magic-link\/verify/ })
    errorGuard.allow({ console: /status of 401/ })
    await allMethods(page)
    const requests = await mockPost(page, '/auth/magic-link/request', () => ({ status: 204 }))
    await mockPost(page, '/auth/magic-link/verify', () => ({
      status: 401,
      body: { error: 'TOKEN_INVALID', message: 'Invalid or expired magic link' }
    }))
    await page.goto('/auth/magic-link?token=e2e-bogus&redirect=/app/users')
    await page.getByRole('button', { name: 'Continue signing in' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'This link is not valid' })).toBeVisible()
    // One action, and it does not claim to send anything.
    await expect(page.getByRole('link', { name: 'Email me a new link' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toHaveCount(0)
    const newLink = page.getByRole('link', { name: 'Request a new link' })
    await expect(newLink).toHaveAttribute('href', /^\/auth\/login\?method=email&redirect=(%2F|\/)app(%2F|\/)users$/)

    await newLink.click()
    // The email form is open (not folded behind "Continue with email"); ?redirect stays.
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a magic link instead' })).toBeVisible()
    await expect(page).toHaveURL(url => url.pathname === '/auth/login'
      && url.searchParams.get('redirect') === '/app/users'
      && !url.searchParams.has('method'))
    expect(requests()).toBe(0)
  })

  test('a magic link that could not be checked offers a retry and the way back', async ({ page, errorGuard }) => {
    errorGuard.allow({ status: 503, url: /magic-link\/verify/ })
    errorGuard.allow({ console: /status of 503/ })
    await mockPost(page, '/auth/magic-link/verify', () => ({ status: 503, body: { error: 'HTTP_ERROR', message: 'Unavailable' } }))
    await page.goto('/auth/magic-link?token=e2e-bogus&redirect=/app/users')
    await page.getByRole('button', { name: 'Continue signing in' }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Could not reach the sign-in service' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Request a new link' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Back to sign in' })).toHaveAttribute('href', /^\/auth\/login\?redirect=(%2F|\/)app(%2F|\/)users$/)
  })

  test('staying signed in from an emailed link keeps its destination', async ({ requires, sessionContext }) => {
    await requires({ personas: ['admin'] })
    const admin = persona('admin')
    const context = await sessionContext(personaState('admin'))
    const page = await context.newPage()
    // Nothing is verified on arrival, so a placeholder token is enough to reach the prompt.
    await page.goto('/auth/magic-link?token=e2e-placeholder&redirect=/app/users')
    await expect(page.getByRole('heading', { level: 1, name: `You're signed in as ${admin.email}` })).toBeVisible()
    await expect(page.getByRole('link', { name: `Stay signed in as ${admin.email}` })).toHaveAttribute('href', '/app/users')
    await expect(page.getByRole('button', { name: 'Sign out and continue' })).toBeEnabled()
  })

  test('invitations turned off on the server are explained', async ({ page }) => {
    await patchAuthConfig(page, config => ({ ...config, features: { ...config.features, invitations: false } }))
    await page.goto('/auth/accept-invite?token=demo-token')
    await expect(page.getByRole('heading', { name: 'Invitations are turned off' })).toBeVisible()
    await expect(page.getByLabel('Password', { exact: true })).toHaveCount(0)
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`the brand logo stays visible and the guest pages pass axe in ${scheme} mode`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme })
      for (const path of ['/auth/login', '/auth/recovery', '/auth/access-code']) {
        await page.goto(path)
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        const logo = page.getByRole('img', { name: 'OutlabsAuth' })
        await expect(logo).toHaveAttribute('src', scheme === 'dark' ? /outlabs-auth-logo-dark\.svg$/ : /outlabs-auth-logo\.svg$/)
        const results = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          // color-contrast stays out: light-mode contrast is an accepted limitation (F-032).
          .disableRules(['color-contrast'])
          .analyze()
        expect(results.violations.map(v => ({ path, id: v.id, nodes: v.nodes.length }))).toEqual([])
      }
    })
  }
})
