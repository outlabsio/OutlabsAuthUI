import type { Locator } from '@playwright/test'

import { expect } from '@playwright/test'

const selectAllShortcut = process.platform === 'darwin' ? 'Meta+A' : 'Control+A'

function getTextboxByLabel(container: Locator, label: string | RegExp) {
  if (typeof label === 'string') {
    return container.getByRole('textbox', { name: label })
  }

  return container.getByRole('textbox', { name: label })
}

export async function typeIntoBaseUiTextbox(control: Locator, value: string) {
  await expect(control).toBeVisible()
  await control.click()
  await control.press(selectAllShortcut)
  await control.press('Backspace')
  await control.pressSequentially(value)
  await expect(control).toHaveValue(value)
}

export async function typeIntoBaseUiField(
  container: Locator,
  label: string | RegExp,
  value: string
) {
  const control = getTextboxByLabel(container, label)

  await typeIntoBaseUiTextbox(control, value)

  return control
}
