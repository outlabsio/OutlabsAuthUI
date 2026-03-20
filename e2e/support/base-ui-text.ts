import type { Locator } from '@playwright/test'

import { expect } from '@playwright/test'

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function getTextboxByLabel(container: Locator, label: string | RegExp) {
  const labelPattern =
    typeof label === 'string'
      ? new RegExp(`^${escapeForRegex(label)}$`)
      : label
  const labelElement = container.locator('label').filter({ hasText: labelPattern }).first()
  const htmlFor = await labelElement.getAttribute('for')

  if (htmlFor) {
    return container.page().locator(`#${htmlFor}`)
  }

  return container.getByRole('textbox', { name: label })
}

export async function typeIntoBaseUiTextbox(control: Locator, value: string) {
  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await expect(control).toBeVisible()
      await control.click()
      await control.fill(value)
      await expect(control).toHaveValue(value, { timeout: 1_500 })
      return
    } catch (error) {
      lastError = error
    }
  }

  throw lastError
}

export async function typeIntoBaseUiField(
  container: Locator,
  label: string | RegExp,
  value: string
) {
  const control = await getTextboxByLabel(container, label)

  await typeIntoBaseUiTextbox(control, value)

  return control
}
