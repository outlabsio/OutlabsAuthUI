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
  let lastError: unknown = null

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await expect(control).toBeVisible()
      await control.click()
      const currentValue = await control.inputValue()

      if (currentValue.length > 0) {
        await control.selectText()
        await control.press('Backspace')

        const clearedValue = await control.inputValue()
        if (clearedValue.length > 0) {
          await control.press(selectAllShortcut)
          await control.press('Backspace')
        }
      }

      await control.type(value)

      const nextValue = await control.inputValue()

      if (nextValue === value) {
        return
      }

      const firstCharacterDropped =
        value.length === 1 ? nextValue === '' : nextValue === value.slice(1)

      if (firstCharacterDropped && value.length > 0) {
        await control.selectText()
        await control.press('Backspace')
        await control.type(`${value[0]}${value}`)
        await expect(control).toHaveValue(value, { timeout: 1_500 })
        return
      }

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
  const control = getTextboxByLabel(container, label)

  await typeIntoBaseUiTextbox(control, value)

  return control
}
