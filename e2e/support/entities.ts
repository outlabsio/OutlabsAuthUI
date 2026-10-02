import { expect, type Locator, type Page } from '@playwright/test'

// Helpers for the entities workspace (tree + detail) and its dialogs.

// A tree row by its entity name (the row is a treeitem; its name also carries the badges).
export function treeRow(page: Page, displayName: string): Locator {
  return page.getByRole('tree', { name: 'Entity hierarchy' }).getByRole('treeitem', { name: new RegExp(`^${escapeRegExp(displayName)}`) })
}

// Open an entity's detail through the URL (?entity=) and wait for it.
export async function openEntity(page: Page, entityId: string, displayName: string) {
  await page.goto(`/app/entities?entity=${entityId}`)
  await expect(page.getByRole('heading', { name: displayName, exact: true })).toBeVisible()
}

// An AppEntityPicker option by the entity's name (the option also carries its path).
export function entityOption(page: Page, displayName: string): Locator {
  return page.getByRole('option').filter({ has: page.locator('[data-slot="itemLabel"]', { hasText: new RegExp(`^${escapeRegExp(displayName)}$`) }) })
}

// Open an AppEntityPicker by its trigger and choose an entity, searching when a term is given
// (needed in the superuser's global mode, which lists only organisations without one).
export async function pickEntity(page: Page, trigger: Locator, displayName: string, { search = false } = {}) {
  await trigger.click()
  if (search) await page.getByRole('combobox', { name: 'Search entities' }).fill(displayName)
  await entityOption(page, displayName).click()
  await expect(trigger).toContainText(displayName)
}

// The detail's secondary actions (Governance, Move, Archive).
export async function entityAction(page: Page, name: 'Governance' | 'Move' | 'Archive') {
  await page.getByRole('button', { name: 'More entity actions' }).click()
  await page.getByRole('menuitem', { name }).click()
}

// A detail card (UCard) by its heading.
export function cardByHeading(page: Page, name: string): Locator {
  return page.getByRole('heading', { name, exact: true }).locator('xpath=ancestor::*[@data-slot="root"][1]')
}

export function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
