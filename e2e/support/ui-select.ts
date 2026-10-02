import type { Locator, Page } from '@playwright/test'

// Nuxt UI USelect/USelectMenu render a trigger (USelect: role combobox; USelectMenu: a button)
// that opens a portalled listbox of role="option" items, not a native <select>. Reach the
// trigger by its accessible name, never by id (F-232): `field(dialog, 'Status')` finds the
// trigger named by its UFormField label or its aria-label, so a field that loses its name
// fails here first.

/** The select (or any field) named `label` inside `scope`. */
export function field(scope: Page | Locator, label: string): Locator {
  return scope.getByLabel(label, { exact: true })
}

// USelect: open the trigger, click the option by its visible label.
export async function chooseSelect(page: Page, trigger: Locator, optionLabel: string) {
  await trigger.click()
  await page.getByRole('option', { name: optionLabel, exact: true }).click()
}

// USelectMenu (searchable): open and pick the option. USelectMenu doesn't virtualize by
// default, so every option is in the DOM; no need to type into the (focus-racy) search box.
// Playwright scrolls the target option into view before clicking.
export async function chooseSelectMenu(page: Page, trigger: Locator, optionLabel: string) {
  await trigger.click()
  await page.getByRole('option', { name: optionLabel, exact: true }).click()
}
