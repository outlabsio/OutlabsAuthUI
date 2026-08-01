import type { Locator, Page } from '@playwright/test'

import { expect } from '@playwright/test'

type SelectBaseUiOptionArgs = {
  container: Locator
  page: Page
  fieldLabel: string | RegExp
  optionName: string | RegExp
}

function escapeForRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getTextLocator(container: Locator, value: string | RegExp) {
  if (typeof value === 'string') {
    return container.getByText(value, { exact: true }).first()
  }

  return container.getByText(value).first()
}

export async function selectBaseUiOption({
  container,
  page,
  fieldLabel,
  optionName,
}: SelectBaseUiOptionArgs) {
  const label = getTextLocator(container, fieldLabel)
  const field = label.locator('xpath=ancestor::div[.//*[@role="combobox"]][1]')
  const trigger = field.getByRole('combobox').first()

  await expect(trigger).toBeVisible()
  await trigger.click()

  const option =
    typeof optionName === 'string'
      ? page
          .locator('[role="option"]:visible')
          .filter({
            hasText: new RegExp(`^${escapeForRegex(optionName)}$`),
          })
          .first()
      : page
          .locator('[role="option"]:visible')
          .filter({
            hasText: optionName,
          })
          .first()

  await expect(option).toBeVisible()
  await option.click()
}
