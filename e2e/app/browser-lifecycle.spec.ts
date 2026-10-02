import { readFileSync } from 'node:fs'
import { expect, persona, personaState, test } from '../support/fixtures'
import { openEntity } from '../support/entities'
import { ACCESS_TOKEN_KEY, apiUrl, REFRESH_TOKEN_KEY } from '../support/env'
import { jsonResponse } from '../support/mocks'
import { openEmailForm } from '../support/sign-in'

// The browser around the console (F-229): a signed-out deep link survives sign-in, a reload keeps
// the record and tab, Back and Forward walk through selections, and deleting the only row of the
// last page lands on a page that has rows. Record-link edge cases (malformed and unknown ids) are
// in each workspace's spec; a dialog or the one-time secret on Back is in dialog-kit.spec.ts.

type Named = { id: string, display_name?: string | null, email?: string }

// The admin persona's minted tokens, so a sign-in can be answered without a password login.
function adminTokens() {
  const state = JSON.parse(readFileSync(personaState('admin'), 'utf8')) as { origins: Array<{ localStorage: Array<{ name: string, value: string }> }> }
  const items = state.origins.flatMap(origin => origin.localStorage)
  return {
    access_token: items.find(item => item.name === ACCESS_TOKEN_KEY)!.value,
    refresh_token: items.find(item => item.name === REFRESH_TOKEN_KEY)!.value,
    token_type: 'bearer'
  }
}

test.describe('a signed-out deep link', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test('signing in lands on the record and tab the link asked for', async ({ page, api, requires }) => {
    await requires({ authMethods: ['password'], personas: ['admin', 'agent'] })
    const agent = await api.findUserByEmail(persona('agent').email)
    // The sign-in itself is answered with the admin persona's session (no password login spent).
    await page.route(apiUrl('/auth/login'), route => route.request().method() === 'POST'
      ? route.fulfill(jsonResponse(200, adminTokens(), 'POST,OPTIONS'))
      : route.fallback())

    const target = `/app/users/${agent!.id}?tab=access`
    await page.goto(target)
    await expect(page).toHaveURL(/\/auth\/login\?redirect=/)
    await openEmailForm(page)
    await page.getByLabel('Email').fill('admin@example.com')
    await page.getByLabel('Password', { exact: true }).fill('not-checked-here')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page).toHaveURL(target)
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()
  })
})

test.describe('reload, Back and Forward', () => {
  test('a reload keeps the record and its tab', async ({ page, apiAs }) => {
    const agent = await apiAs('agent').me()
    // The tabs are links; the Access tab's cards say which one is showing.
    await page.goto(`/app/users/${agent.id}?tab=access`)
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()
    await page.reload()
    await expect(page).toHaveURL(new RegExp(`/app/users/${agent.id}\\?tab=access$`))
    await expect(page.getByRole('heading', { name: 'Direct roles' })).toBeVisible()
    await expect(page.getByRole('heading', { name: /^Could not load / })).toHaveCount(0)
  })

  test('Back and Forward walk through entity selections, and a reload keeps the last one', async ({ page, api, requires }) => {
    await requires({ surfaces: ['entities'] })
    const parent = await api.createEntity({ kind: 'nav-parent' })
    const first = await api.createEntity({ kind: 'nav-a', entity_type: 'region', parent_entity_id: parent.id })
    const second = await api.createEntity({ kind: 'nav-b', entity_type: 'region', parent_entity_id: parent.id })
    const heading = (entity: Named) => page.getByRole('heading', { name: entity.display_name!, exact: true })

    await openEntity(page, parent.id, parent.display_name!)
    await page.getByRole('link', { name: first.display_name!, exact: true }).click()
    await expect(heading(first)).toBeVisible()
    await page.goBack()
    await expect(heading(parent)).toBeVisible()
    await page.getByRole('link', { name: second.display_name!, exact: true }).click()
    await expect(heading(second)).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`entity=${second.id}`))

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`entity=${parent.id}`))
    await expect(heading(parent)).toBeVisible()
    await page.goForward()
    await expect(page).toHaveURL(new RegExp(`entity=${second.id}`))
    await expect(heading(second)).toBeVisible()
    await page.reload()
    await expect(heading(second)).toBeVisible()
  })
})

test.describe('deleting the last row of the last page', () => {
  test('lands on the page before it, with its rows', async ({ page, api, testData }) => {
    test.setTimeout(90_000)
    // 26 accounts that only this test's search matches: 25 on page 1, one on page 2.
    const tag = testData.resource('lastpage')
    const users: Named[] = []
    for (let i = 0; i < 26; i++) users.push(await api.createUser({ kind: `${tag}-${String(i).padStart(2, '0')}` }))

    await page.goto(`/app/users?q=${tag}&page=2`)
    const rows = page.locator('tbody tr')
    await expect(rows).toHaveCount(1)
    const [last] = await rows.allInnerTexts()
    const lastUser = users.find(user => last!.includes(user.email!))!
    await page.getByRole('button', { name: `User actions for ${lastUser.email}` }).click()
    await page.getByRole('menuitem', { name: /^Delete/ }).click()
    const confirm = page.getByRole('dialog')
    await confirm.getByRole('textbox').fill(lastUser.email!)
    await confirm.getByRole('button', { name: 'Delete user' }).click()
    await expect(confirm).toBeHidden()

    // Page 2 no longer exists: the list shows page 1 and its 25 rows, not an empty table.
    await expect(page).not.toHaveURL(/[?&]page=2/)
    await expect(rows).toHaveCount(25)
    await expect(page.getByText('No users match')).toHaveCount(0)
  })
})
