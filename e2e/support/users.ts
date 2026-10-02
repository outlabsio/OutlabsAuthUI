import type { Locator, Page } from '@playwright/test'

// The user detail page (pages/app/users/[userId].vue): tabs in the route query and the navbar's
// actions. Overview holds the Profile; Access the Direct roles and Memberships; Security the
// sessions and personal API keys; History the audit timeline and membership history.

export type UserDetailTab = 'overview' | 'access' | 'security' | 'history'

/** The detail URL of one tab: `/app/users/<id>` or `/app/users/<id>?tab=access`. */
export function userDetailPath(userId: string, tab: UserDetailTab = 'overview'): string {
  return tab === 'overview' ? `/app/users/${userId}` : `/app/users/${userId}?tab=${tab}`
}

/** The tab bar under the navbar. */
export function userTabs(page: Page): Locator {
  return page.getByRole('navigation', { name: 'User sections' })
}

/** The navbar's icon-only menu of lifecycle actions (Edit is its own button). */
export function userActionsButton(page: Page): Locator {
  return page.getByRole('button', { name: 'More user actions' })
}

/** Open the navbar's actions menu and pick one item. */
export async function openUserAction(page: Page, item: string): Promise<void> {
  await userActionsButton(page).click()
  await page.getByRole('menuitem', { name: item, exact: true }).click()
}
