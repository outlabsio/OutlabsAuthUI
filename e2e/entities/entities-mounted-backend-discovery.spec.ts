import type { Page } from '@playwright/test'

import { expect, test } from '../support/auth-fixture'
import { buildE2eAuthApiUrl } from '../support/auth-personas'

type EntityListItem = {
  id?: string
  display_name: string
}

type EntityListResponse = {
  items: EntityListItem[]
}

type SessionUser = {
  root_entity_name?: string | null
}

async function gotoEntitiesWorkspace(page: Page) {
  await page.goto('/app/entities')

  await expect(page).toHaveURL(/\/app\/entities(?:\?.*)?$/)
  await expect(page.getByRole('button', { name: 'Open Entities guide' })).toBeVisible()
  await expect(page.getByText('Hierarchy navigator')).toBeVisible()
}

async function selectEntityFromTree(page: Page, searchValue: string, entityName: string) {
  const searchField = page.getByRole('textbox', { name: 'Search this hierarchy' })

  await searchField.fill(searchValue)
  await expect(searchField).toHaveValue(searchValue)

  const treeRow = page
    .getByRole('button', {
      name: new RegExp(escapeRegExp(entityName), 'i'),
    })
    .first()

  await expect(treeRow).toBeVisible()
  await treeRow.click()
  await expect(
    page.getByRole('heading', {
      name: entityName,
    })
  ).toBeVisible()
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function selectRootScope(page: Page, displayName: string) {
  const rootScopeField = page.locator('#entities-root-scope')

  await rootScopeField.fill(displayName)
  await page
    .getByRole('option', { name: new RegExp(escapeRegExp(displayName), 'i') })
    .first()
    .click()
  await expect(rootScopeField).toHaveValue(displayName)
}

async function getAccessToken(page: Page) {
  const accessToken = await page.evaluate(() =>
    window.localStorage.getItem('outlabs-auth.access-token')
  )

  if (!accessToken) {
    throw new Error('Expected auth access token in localStorage.')
  }

  return accessToken
}

async function loadFirstAgentRoot(page: Page) {
  const accessToken = await getAccessToken(page)
  const response = await page.request.get(
    buildE2eAuthApiUrl('/entities/?page=1&limit=1&root_only=true&entity_type=agent_practice'),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  expect(response.ok()).toBeTruthy()

  const payload = (await response.json()) as EntityListResponse
  expect(payload.items.length).toBeGreaterThan(0)

  return payload.items[0]
}

async function loadCurrentSession(page: Page) {
  const accessToken = await getAccessToken(page)
  const response = await page.request.get(buildE2eAuthApiUrl('/users/me'), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  })

  expect(response.ok()).toBeTruthy()

  return (await response.json()) as SessionUser
}

async function loadAlternateRoot(page: Page) {
  const accessToken = await getAccessToken(page)
  const response = await page.request.get(
    buildE2eAuthApiUrl('/entities/?page=2&limit=1&root_only=true'),
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  expect(response.ok()).toBeTruthy()

  const payload = (await response.json()) as EntityListResponse
  expect(payload.items.length).toBeGreaterThan(0)

  return payload.items[0]
}

test.describe('Mounted Backend Entity Discovery', () => {
  test('superuser defaults to the current root and can search-select another root scope', async ({
    page,
  }) => {
    await gotoEntitiesWorkspace(page)
    const sessionUser = await loadCurrentSession(page)

    const rootScopeField = page.locator('#entities-root-scope')
    expect(sessionUser.root_entity_name).toBeTruthy()
    await expect(rootScopeField).toHaveValue(sessionUser.root_entity_name ?? '')
    await expect(
      page.getByRole('heading', {
        name: sessionUser.root_entity_name ?? '',
      })
    ).toBeVisible()

    const alternateRoot = await loadAlternateRoot(page)
    await selectRootScope(page, alternateRoot.display_name)
    await expect(
      page.getByRole('heading', {
        name: alternateRoot.display_name,
      })
    ).toBeVisible()
  })

  test('agent roots show the migrated agent name and friendly Agent type label', async ({
    page,
  }) => {
    await gotoEntitiesWorkspace(page)

    const agentRoot = await loadFirstAgentRoot(page)
    await selectRootScope(page, agentRoot.display_name)

    const rootScopeField = page.locator('#entities-root-scope')
    await expect(page.getByRole('heading', { name: agentRoot.display_name })).toBeVisible()
    await expect(rootScopeField).not.toHaveValue(/Agent Practice/i)
    await expect(page.getByText('Agent', { exact: true }).first()).toBeVisible()
  })

  test('entity membership dialog uses the shared role table and lifecycle panel', async ({
    page,
  }) => {
    await gotoEntitiesWorkspace(page)
    await selectEntityFromTree(page, 'DevOps', 'DevOps')
    await page.getByRole('tab', { name: 'Members and access' }).click()

    await page.getByRole('button', { name: 'Add member' }).click()

    const dialog = page.getByRole('dialog', { name: 'Add member to DevOps' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText('Role assignment')).toBeVisible()
    await expect(dialog.getByText('Membership lifecycle')).toBeVisible()
    await expect(dialog.getByRole('textbox', { name: 'Search roles' })).toBeVisible()
    await expect(dialog.getByText('Selected only')).toBeVisible()

    const viewportHeight = await page.evaluate(() => window.innerHeight)
    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox?.height ?? 0).toBeGreaterThan(viewportHeight * 0.8)

    const rolesScrollRegion = dialog.locator('[data-slot="assignable-roles-scroll-region"]')
    const stickyHeader = dialog.getByRole('columnheader', { name: 'Role' })
    const headerBoxBeforeScroll = await stickyHeader.boundingBox()

    const rolesScrollMetrics = await rolesScrollRegion.evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: window.getComputedStyle(element).overflowY,
    }))
    expect(rolesScrollMetrics.overflowY).toMatch(/auto|scroll/)
    expect(rolesScrollMetrics.clientHeight).toBeGreaterThan(200)
    await expect(dialog.getByText('Agent Member', { exact: true })).toBeVisible()

    await rolesScrollRegion.evaluate((element) => {
      element.scrollTo({ top: 900 })
    })
    await expect
      .poll(async () => rolesScrollRegion.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0)

    const headerBoxAfterScroll = await stickyHeader.boundingBox()
    expect(headerBoxBeforeScroll).not.toBeNull()
    expect(headerBoxAfterScroll).not.toBeNull()
    expect(
      Math.abs((headerBoxBeforeScroll?.y ?? 0) - (headerBoxAfterScroll?.y ?? 0))
    ).toBeLessThanOrEqual(2)

    const userSearchField = dialog.locator('#entity-member-search')
    await userSearchField.fill('and')
    await expect(userSearchField).toHaveValue('and')

    const cancelButton = dialog.getByRole('button', { name: 'Cancel' })
    const submitButton = dialog.getByRole('button', { name: 'Add member' })
    const cancelBox = await cancelButton.boundingBox()
    const submitBox = await submitButton.boundingBox()

    expect(cancelBox).not.toBeNull()
    expect(submitBox).not.toBeNull()
    expect(Math.abs((cancelBox?.y ?? 0) - (submitBox?.y ?? 0))).toBeLessThanOrEqual(2)

    await cancelButton.click()
    await expect(dialog).toBeHidden()
  })
})
