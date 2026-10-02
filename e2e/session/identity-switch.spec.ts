import type { BrowserContext, Page } from '@playwright/test'
import { ACCESS_TOKEN_KEY, apiUrl, REFRESH_TOKEN_KEY } from '../support/env'
import { expect, test } from '../support/fixtures'
import { expireAccessToken, mintFreshSession, type SessionTokens } from '../support/sessions'
import { userMenuButton } from '../support/shell'

// Another account signing in while this tab is still working (session lane). Tabs of one browser
// profile share the tokens in localStorage, so a sign-in as someone else in another tab (a
// magic-link or invitation "switch account" confirmation) replaces them under this tab's feet.
// Whatever this tab started as the first account must never complete as the second:
//   - a request refused meanwhile (its access token expired) is not replayed with the other
//     account's bearer token;
//   - the tab reloads into the new identity even while a dialog holds unsaved input, without a
//     "Leave site?" prompt that would let the user stay and save the first account's dialog with
//     the second account's session.
// Both accounts are fresh run-marked users whose sessions this test owns.

test.use({ errorGuardMode: 'strict' })

// A fresh context's first SPA boot can take a while on a cold dev server.
const BOOT = { timeout: 30_000 }

// "Another tab" signs in as `tokens`: a same-origin document that does not run the console (so
// it presents nothing itself) writes the tokens the way a sign-in there stores them, which fires
// the storage event in every other tab.
async function signInElsewhere(context: BrowserContext, tokens: SessionTokens): Promise<Page> {
  const other = await context.newPage()
  await other.goto('/robots.txt')
  await other.evaluate(([accessKey, refreshKey, access, refresh]) => {
    localStorage.setItem(accessKey!, access!)
    localStorage.setItem(refreshKey!, refresh!)
  }, [ACCESS_TOKEN_KEY, REFRESH_TOKEN_KEY, tokens.access_token, tokens.refresh_token])
  return other
}

test.describe('identity switch in another tab', () => {
  test.beforeEach(async ({ requires, errorGuard }) => {
    await requires({ surfaces: ['users'] })
    // The expired token's attempt is SUPPOSED to be refused once.
    errorGuard.allow({ kind: 'api', status: 401 }, { kind: 'console', console: /status of 401/ })
    // F-043: icons are fetched from the Iconify API until they are bundled with the build.
    errorGuard.allow({ kind: 'third-party', url: /^https:\/\/api\.iconify\.design\// })
  })

  test('a request refused while another account signs in is not replayed as that account', async ({ api, sessionContext }) => {
    const { tokens } = await mintFreshSession(api, 'identity-first')
    const { tokens: secondTokens } = await mintFreshSession(api, 'identity-second')
    const context = await sessionContext(tokens)
    const page = await context.newPage()
    await page.goto('/app/account')
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible(BOOT)
    await expireAccessToken(page)

    // Every bearer token the profile save presents.
    const presented: string[] = []
    page.on('request', (request) => {
      if (request.url() === apiUrl('/users/me') && request.method() === 'PATCH') presented.push(request.headers().authorization ?? '')
    })
    // The save reaches the API with the expired token and is refused; before that answer reaches
    // the tab, the second account signs in in another tab.
    let switched = false
    await context.route(apiUrl('/users/me'), async (route) => {
      if (route.request().method() !== 'PATCH' || switched) return route.continue()
      switched = true
      const refused = await route.fetch()
      await signInElsewhere(context, secondTokens)
      return route.fulfill({ response: refused })
    })

    await page.getByLabel('First name').fill('Replayed')
    await page.getByRole('button', { name: 'Save profile' }).click()

    // The tab follows the switch: it reloads into the second account.
    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(userMenuButton(page)).toHaveAccessibleName(/^E2E identity-second, /)
    // The refused save was not sent again with the second account's token, so nothing changed
    // on that account.
    expect(switched).toBe(true)
    expect(presented).not.toContain(`Bearer ${secondTokens.access_token}`)
    expect(presented).toHaveLength(1)
    const me = await fetch(apiUrl('/users/me'), { headers: { Authorization: `Bearer ${secondTokens.access_token}` } })
    expect(((await me.json()) as { first_name?: string | null }).first_name).toBe('E2E')
  })

  test('the tab reloads into the new account without a leave prompt while a dialog holds unsaved input', async ({ api, sessionContext, requires }) => {
    await requires({ surfaces: ['api_keys'] })
    const { tokens } = await mintFreshSession(api, 'identity-dialog')
    const { tokens: secondTokens } = await mintFreshSession(api, 'identity-dialog-second')
    const context = await sessionContext(tokens)
    const page = await context.newPage()
    await page.goto('/app/api-keys')
    await page.getByRole('button', { name: 'Create API key' }).click(BOOT)
    const dialog = page.getByRole('dialog', { name: 'Create personal API key' })
    await dialog.getByLabel('Name', { exact: true }).fill('Unsaved key')

    // A "Leave site?" prompt would let the user stay; answer it the way staying does.
    const prompts: string[] = []
    page.on('dialog', (prompt) => {
      prompts.push(prompt.type())
      void prompt.dismiss()
    })
    await signInElsewhere(context, secondTokens)

    await expect(page).toHaveURL(/\/app\/dashboard$/)
    await expect(userMenuButton(page)).toHaveAccessibleName(/^E2E identity-dialog-second, /)
    await expect(dialog).toHaveCount(0)
    expect(prompts).toEqual([])
  })
})
