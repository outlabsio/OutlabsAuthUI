import type { Page } from '@playwright/test'
import { authApiPrefix } from './env'
import { corsHeaders, jsonResponse } from './mocks'

// Shared drivers for the unified sign-in (method-buttons pattern). When OAuth providers or
// phone OTP are offered, the email form hides behind a "Continue with email" button that
// unfolds it; email-only surfaces render the form directly. These helpers handle both.

export async function openEmailForm(page: Page) {
  const button = page.getByRole('button', { name: 'Continue with email', exact: true })
  const directEmail = page.getByLabel('Email')
  // The methods layout waits on capability discovery — settle into EITHER layout (method
  // buttons or the direct email-only form) before deciding whether to unfold.
  await button.or(directEmail).first().waitFor()
  if (await button.count()) await button.click()
}

// Mock /auth/config with password-only capabilities — deterministic "email-only deployment"
// regardless of which backend (if any) is reachable from the console.
export async function mockPasswordOnlyConfig(page: Page) {
  await page.route(`**${authApiPrefix}/auth/config`, async (route) => {
    if (route.request().method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: corsHeaders('GET,OPTIONS') })
    }
    return route.fulfill(jsonResponse(200, {
      preset: 'SimpleRBAC',
      features: { magic_links: false, access_codes: false },
      auth_methods: { password: true, magic_link: false, access_code: false }
    }, 'GET,OPTIONS'))
  })
}

export async function openPhonePanel(page: Page) {
  await page.getByRole('button', { name: 'Continue with phone' }).click()
}

export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto('/auth/login')
  await openEmailForm(page)
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
}

// Request an email access code through the unified flow (email form → "code instead").
export async function requestEmailCode(page: Page, email: string) {
  await page.goto('/auth/login')
  await openEmailForm(page)
  await page.getByLabel('Email').fill(email)
  await page.getByRole('button', { name: 'Email me a code instead' }).click()
}

// What the sign-in and signup pages write to sessionStorage right before leaving for an OAuth
// provider (app/auth/pending-oauth.ts): the callback uses a session only in a tab holding a
// fresh marker. `ageMs` back-dates it. The page must already be on the console origin.
export const PENDING_OAUTH_KEY = 'outlabs-auth.pending-oauth'

export async function markOAuthPending(page: Page, { ageMs = 0 } = {}) {
  await page.evaluate(({ key, ageMs }) => {
    const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('')
    sessionStorage.setItem(key, JSON.stringify({ nonce, startedAt: Date.now() - ageMs }))
  }, { key: PENDING_OAUTH_KEY, ageMs })
}

export async function readOAuthPending(page: Page): Promise<string | null> {
  return page.evaluate(key => sessionStorage.getItem(key), PENDING_OAUTH_KEY)
}
