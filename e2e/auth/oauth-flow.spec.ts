import type { Page } from '@playwright/test'

import { expect, test } from '@playwright/test'

import {
  authPersonas,
  buildE2eAuthApiUrl,
  e2eBaseURL,
} from '../support/auth-personas'
import { skipUnlessLiveGoogleOAuthConfigured } from '../support/google-oauth-live'

const emptyStorageState = {
  cookies: [],
  origins: [],
}

async function loginForOAuthTokens() {
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
    throw new Error(`Unable to mint OAuth callback tokens: ${response.status}`)
  }

  return (await response.json()) as {
    access_token: string
    refresh_token: string
    token_type?: string
  }
}

async function gotoLogin(page: Page) {
  await page.goto('/auth/login')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
}

test.describe('OAuth login (mocked provider redirect)', () => {
  test.use({ storageState: emptyStorageState })

  test('login shows invite-only Google error from oauth_error search param', async ({
    page,
  }) => {
    await page.goto('/auth/login?oauth_error=unknown_account')
    await expect(
      page.getByText(
        'No console account exists for that Google email. Ask an admin to invite you first.'
      )
    ).toBeVisible()
  })

  test('Continue with Google completes via mocked authorize + hash callback', async ({
    page,
  }) => {
    const tokens = await loginForOAuthTokens()
    const callbackUrl = new URL('/auth/oauth/callback', e2eBaseURL)
    callbackUrl.hash = new URLSearchParams({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type ?? 'bearer',
    }).toString()

    await page.route('**/oauth/google/authorize**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        json: {
          authorization_url: callbackUrl.toString(),
        },
      })
    })

    await gotoLogin(page)
    await page.getByRole('button', { name: 'Continue with Google' }).click()

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(page.getByRole('button', { name: 'Open Dashboard guide' })).toBeVisible()
  })

  test('oauth callback without tokens shows recovery link', async ({ page }) => {
    await page.goto('/auth/oauth/callback')
    await expect(
      page.getByText('Google sign-in did not return a usable session.')
    ).toBeVisible()
    await page.getByRole('link', { name: 'Back to sign in' }).click()
    await expect(page).toHaveURL(/\/auth\/login$/)
  })
})

test.describe('OAuth login (live authorize boundary)', () => {
  test.use({ storageState: emptyStorageState })

  test('backend Google authorize returns a Google authorization URL', async () => {
    skipUnlessLiveGoogleOAuthConfigured()

    const response = await fetch(buildE2eAuthApiUrl('/oauth/google/authorize'))
    expect(
      response.ok,
      `Expected Google authorize to be mounted (status ${response.status}). Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET on the enterprise backend.`
    ).toBeTruthy()

    const payload = (await response.json()) as { authorization_url?: string }
    expect(payload.authorization_url).toBeTruthy()

    const authorizationUrl = new URL(payload.authorization_url!)
    expect(authorizationUrl.hostname).toMatch(/google\.com$/)
    expect(authorizationUrl.searchParams.get('client_id')).toBeTruthy()
    expect(authorizationUrl.searchParams.get('redirect_uri')).toBeTruthy()
  })

  test('Continue with Google navigates to the live Google authorize URL', async ({
    page,
  }) => {
    skipUnlessLiveGoogleOAuthConfigured()

    const authorizeResponse = await fetch(
      buildE2eAuthApiUrl('/oauth/google/authorize')
    )
    test.skip(
      !authorizeResponse.ok,
      `Google authorize is not mounted (status ${authorizeResponse.status}).`
    )

    await gotoLogin(page)
    await page.getByRole('button', { name: 'Continue with Google' }).click()

    await page.waitForURL(/accounts\.google\.com|google\.com\/o\/oauth2/, {
      timeout: 15_000,
    })
    expect(page.url()).toMatch(/client_id=/)
  })
})
