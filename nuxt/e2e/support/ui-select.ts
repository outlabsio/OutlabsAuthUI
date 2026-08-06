import type { Page } from '@playwright/test'

// Nuxt UI USelect/USelectMenu render a trigger button (carrying the component's id) that opens
// a portalled listbox of role="option" items — not a native <select>. These helpers drive them.

// USelect: open by id, click the option by its visible label.
export async function chooseSelect(page: Page, triggerId: string, optionLabel: string) {
  await page.locator(`#${triggerId}`).click()
  await page.getByRole('option', { name: optionLabel, exact: true }).click()
}

// USelectMenu (searchable): open and pick the option. USelectMenu doesn't virtualize by
// default, so every option is in the DOM — no need to type into the (focus-racy) search box;
// Playwright scrolls the target option into view before clicking.
export async function chooseSelectMenu(page: Page, triggerId: string, optionLabel: string) {
  await page.locator(`#${triggerId}`).click()
  await page.getByRole('option', { name: optionLabel, exact: true }).click()
}
