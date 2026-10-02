import { expect, test } from '../support/fixtures'
import { apiUrl, appOrigin, backendUrl } from '../support/env'
import { captureAccessCode, captureInviteToken, captureMagicLinkToken } from '../support/passwordless-capture'
import { mintFreshSession } from '../support/sessions'
import { openEmailForm } from '../support/sign-in'

// Emailed-link landings against a real backend, with the codes and links read from the example
// apps' development capture routes (WP-10): a magic link is used only on an explicit click and
// returns to the page the user started from; a browser that is already signed in is asked
// before a magic link or an invitation switches accounts; /auth/access-code accepts a code the
// user already has. Users are fresh and run-marked; sessions come from invite acceptance, so no
// password login is spent.

async function requestAnonymously(path: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  expect(res.status, `${path} answered`).toBe(204)
}

async function fillOtp(page: import('@playwright/test').Page, code: string) {
  for (let i = 0; i < code.length; i++) {
    await page.getByRole('textbox', { name: `pin input ${i + 1} of ${code.length}` }).fill(code[i]!)
  }
}

test.describe('emailed link landings', () => {
  test.use({ errorGuardMode: 'strict' })

  test('a magic link verifies only on click and returns to ?redirect', async ({ page, api, requires }) => {
    await requires({ authMethods: ['magic_link'], capture: ['magic-link'] })
    const user = await api.createUser({ kind: 'magic-intent' })
    const verifies: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && request.url().includes('/auth/magic-link/verify')) verifies.push(request.url())
    })

    await page.goto('/auth/login?redirect=/app/account')
    await openEmailForm(page)
    await page.getByLabel('Email').fill(user.email)
    await page.getByRole('button', { name: 'Email me a magic link instead' }).click()
    await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

    const res = await fetch(`${backendUrl('/dev/auth/magic-link/latest')}?${new URLSearchParams({ email: user.email })}`)
    const captured = await res.json() as { magic_link_url: string, redirect_url?: string | null }
    // The example builds the link on its own FRONTEND_URL; open its path on this console.
    const link = new URL(captured.magic_link_url)
    await page.goto(`${link.pathname}${link.search}`)
    await expect(page.getByRole('heading', { name: 'Continue signing in' })).toBeVisible()
    // Opening the link (as a mail scanner would) must not use it.
    await page.waitForTimeout(750)
    expect(verifies).toEqual([])

    await page.getByRole('button', { name: 'Continue signing in' }).click()
    // The backend canonicalizes the requested page onto its registered console origin; when
    // that is this console, the user lands where they started.
    const returnsHere = captured.redirect_url ? new URL(captured.redirect_url).origin === appOrigin : false
    await expect(page).toHaveURL(url => url.pathname === (returnsHere ? '/app/account' : '/app/dashboard'))
    expect(verifies).toHaveLength(1)
  })

  test('a used magic link explains itself and offers a new one', async ({ page, api, requires, errorGuard }) => {
    await requires({ authMethods: ['magic_link'], capture: ['magic-link'] })
    errorGuard.allow({ status: 401, url: /magic-link\/verify/ })
    errorGuard.allow({ console: /status of 401/ })
    const user = await api.createUser({ kind: 'magic-used' })
    await requestAnonymously('/auth/magic-link/request', { email: user.email })
    const token = await captureMagicLinkToken(user.email)
    expect(token, 'captured magic-link token').toBeTruthy()
    // Used once elsewhere.
    const first = await fetch(apiUrl('/auth/magic-link/verify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    })
    expect(first.ok).toBe(true)

    await page.goto(`/auth/magic-link?token=${encodeURIComponent(token!)}&redirect=/app/account`)
    await page.getByRole('button', { name: 'Continue signing in' }).click()
    await expect(page.getByRole('heading', { name: 'This link was already used' })).toBeVisible()
    const newLink = page.getByRole('link', { name: 'Request a new link' })
    await expect(newLink).toHaveAttribute('href', /^\/auth\/login\?method=email&redirect=/)
    // Nothing is sent from here: the link opens sign-in on the email form, destination kept.
    await newLink.click()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Email me a magic link instead' })).toBeVisible()
    await expect(page).toHaveURL(url => url.pathname === '/auth/login' && url.searchParams.get('redirect') === '/app/account')
  })

  test('a signed-in browser is asked before a magic link switches accounts', async ({ api, requires, sessionContext }) => {
    await requires({ authMethods: ['magic_link'], capture: ['magic-link', 'invite'] })
    const current = await mintFreshSession(api, 'switch-current')
    const target = await api.createUser({ kind: 'switch-target' })
    await requestAnonymously('/auth/magic-link/request', { email: target.email })
    const token = await captureMagicLinkToken(target.email)
    expect(token, 'captured magic-link token').toBeTruthy()

    const context = await sessionContext(current.tokens)
    const page = await context.newPage()
    await page.goto(`/auth/magic-link?token=${encodeURIComponent(token!)}`)
    await expect(page.getByRole('heading', { name: `You're signed in as ${current.user.email}` })).toBeVisible()
    await expect(page.getByRole('link', { name: `Stay signed in as ${current.user.email}` })).toBeVisible()

    await page.getByRole('button', { name: 'Sign out and continue' }).click()
    await expect(page).toHaveURL(url => url.pathname === '/app/dashboard')
    await page.goto('/app/account')
    await expect(page.getByText(`${target.email} is your sign-in email.`, { exact: false })).toBeVisible()
  })

  test('a signed-in browser is asked before accepting an invitation', async ({ api, requires, sessionContext }) => {
    await requires({ capture: ['invite'] })
    const current = await mintFreshSession(api, 'invite-current')
    const email = api.data.email('invite-target')
    await api.post('/auth/invite', { email, first_name: 'E2E', last_name: 'invite-target' })
    const token = await captureInviteToken(email)
    expect(token, 'captured invite token').toBeTruthy()

    const context = await sessionContext(current.tokens)
    const page = await context.newPage()
    await page.goto(`/auth/accept-invite?token=${encodeURIComponent(token!)}`)
    await expect(page.getByRole('heading', { name: `You're signed in as ${current.user.email}` })).toBeVisible()
    await page.getByRole('button', { name: 'Sign out to accept' }).click()
    await expect(page.getByRole('heading', { name: 'Accept your invitation' })).toBeVisible()
    await expect(page).toHaveURL(/\/auth\/accept-invite\?token=/)
  })

  test('the access-code page accepts a code the user already has and honours ?redirect', async ({ page, api, requires }) => {
    await requires({ authMethods: ['access_code'], capture: ['access-code'] })
    const user = await api.createUser({ kind: 'code-page' })
    await requestAnonymously('/auth/access-code/request', { email: user.email, channel: 'email' })
    const code = await captureAccessCode(user.email)
    expect(code, 'captured code').toMatch(/^\d{6}$/)

    await page.goto('/auth/access-code?redirect=/app/account')
    await expect(page.getByRole('heading', { level: 1, name: 'Enter a sign-in code' })).toBeVisible()
    // Email is the preselected channel.
    await expect(page.getByRole('radio', { name: 'Email' })).toBeChecked()
    await page.getByRole('textbox', { name: 'Email' }).fill(user.email)
    await page.getByRole('button', { name: 'Continue', exact: true }).click()
    await expect(page.getByRole('heading', { level: 1, name: 'Enter your code' })).toBeVisible()
    await fillOtp(page, code!)
    await expect(page).toHaveURL(url => url.pathname === '/app/account')
  })
})
